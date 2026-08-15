# المرحلة 22 — التسويق العقاري والتعاقد مع المسوق

مسار تسويقي معزول تمامًا عن المسار الإنشائي: ملف تسويق يملكه مالك المشروع، عقد تسويق مع مسوّق مرخّص، إصدارات محتوى append-only باعتماد المالك، وحقيبة تسويق خارجية موقّعة قابلة للتحقق العام.

## المبدأ الأمني الحاكم

المسوّق **ليس** طرف مشروع (`project_parties`) ولا عضو كيان في مشروع العميل. لو أُدخل في `project_parties` لالتقط سقف الطرف الخارجي في `private.can` عبر `party_ceiling` وانفتحت له وحدات أخرى. لذلك:

- وحدة جديدة في `app_module`: `marketing` فقط، مع صفوف `role_permissions` لها.
- فرع جديد مستقل في `private.can` يُفعَّل **حصريًا** عندما `_module = 'marketing'` — أي طلب لوحدة أخرى (contracts / finance / reports / stages / documents) لا يمر عبر هذا الفرع إطلاقًا ويسقط إلى منطق الرفض القائم. مطابقة الوحدة والفعل معًا (درس المرحلة 20).
- الأفعال المسموحة للمسوّق: `view` دائمًا، و`update`/`create` على بيانات تشغيله فقط (العملاء المحتملون وتقاريره)، **ولا** `approve` ولا أي تعديل على السعر/الوصف.

```text
private.can(user, module, action, project)
  ├─ owner? → true                     (كما هو)
  ├─ explicit deny → false             (كما هو)
  ├─ platform staff (view فقط)         (كما هو)
  ├─ marketing branch [جديد]
  │    شرط الدخول: _module = 'marketing'  ← وإلا لا يُقيَّم أصلاً
  │    عقد تسويق status='active' + within period + المسوّق طرفه
  │    ∩ action ضمن مصفوفة أفعال المسوّق
  ├─ party_ceiling                     (كما هو — لا يشمل المسوّق)
  └─ عضوية/إسناد/منح                   (كما هو)
```

## طبقة البيانات

كل الجداول: RLS مفعّلة deny-by-default، الكتابة حصرًا عبر دوال محروسة، ثم `revoke insert, update, delete, truncate ... from anon, authenticated` و`revoke select ... from anon`.

| الجدول | المحتوى |
|---|---|
| `marketing_profiles` | ملف التسويق لمشروع واحد: `project_id` فريد، `owner_entity_id`، `readiness_basis` (`ready` \| `off_plan`)، `status` (`draft` \| `active` \| `suspended` \| `closed`)، `channel_mode` (`internal` \| `external` \| `both`) |
| `marketing_contracts` | العقد: `profile_id`، `marketer_entity_id`، `exclusivity` (`exclusive` \| `non_exclusive`)، `starts_on`/`ends_on`، `channels[]`، `price_authority` (`owner_fixed` \| `range` \| `negotiable`)، `content_rights`/`lead_rights`/`report_rights`، `termination_terms`، `status` (`draft` \| `active` \| `suspended` \| `terminated` \| `expired`)، `terminated_at`/`terminated_by`/`termination_reason` |
| `marketing_contract_amounts` | المبالغ منفصلة وفق نمط المنصة: `kind` (`commission_percent` \| `commission_fixed` \| `budget`)، `amount`، `currency` |
| `marketing_contract_units` | الوحدات المشمولة: `contract_id` + `property_unit_id` |
| `marketing_versions` | **append-only**: `version_no`، `title_ar/en`، `description_ar/en`، `listing_price`، `price_currency`، `units_snapshot jsonb`، `status` (`draft` \| `approved` \| `superseded`)، `created_by`، `approved_by`/`approved_at`. تريجر `prevent_row_mutation` على UPDATE/DELETE بعد الاعتماد |
| `marketing_assets` | ربط بمستندات النشر فقط: تريجر بنفس منطق `enforce_portfolio_asset_public` (`status='approved'` و`visibility='public_approved'` و`is_deleted=false`) |
| `marketing_leads` | العملاء المحتملون: `contract_id`، `channel_code`، بيانات الاتصال، `stage`. **تبقى ملكًا للمالك بعد الإنهاء** |
| `marketing_packages` | الحقيبة الخارجية: `version_id`، `package_no`، `verify_token` (فريد)، `license_number_snapshot`، `expires_at`، `channel_code`، `watermark_text`، `revoked_at` |

الرخص: تُخزَّن رخصة فال وترخيص الإعلان في `entity_licenses` القائم (`authority`/`discipline`/`expires_on`/`verified_at`) — لا جدول جديد. حالة الصلاحية تُقرأ عبر `entity_license_state` القائمة.

## قواعد الأعمال المفروضة في القاعدة (لا في الواجهة)

1. **الجاهزية (بوابة 1)** — تريجر عند إنشاء/تفعيل ملف التسويق:
   - `readiness_basis='ready'` ⇒ يجب أن يكون المشروع `closed`/`archived` أو له `project_acceptances` نهائي `accepted`.
   - `readiness_basis='off_plan'` ⇒ يجب وجود رخصة بناء سارية في `building_licenses` **و** رخصة بيع على الخارطة (وافي) سارية موثّقة للكيان المالك.
   - غير ذلك ⇒ `MARKETING_PROJECT_NOT_READY`.
2. **الرخصة (بوابة 6)** — `marketing_packages` لا يُنشأ ولا يُوصف بأنه مرخّص إلا إذا أعادت `entity_license_state` للمسوّق `VALID` لحظة الإصدار؛ الرقم يُلقَط snapshot. رخصة منتهية ⇒ `MARKETER_LICENSE_INVALID`. لا يوجد أي عمود «مرخّص» يُكتب يدويًا.
3. **الإصدارات (بوابة 3)** — السعر والوصف والوحدات موجودة **فقط** في `marketing_versions`. لا عمود سعر في `marketing_profiles`. اعتماد الإصدار محصور بـ`approve` على `marketing` (المالك/قيادة كيانه)، والمسوّق لا يملك `approve` في `role_permissions` ولا في فرع `can`. اعتماد إصدار جديد ⇒ السابق `superseded`.
4. **الإنهاء الفوري (بوابة 4)** — فرع المسوّق يشترط `status='active'` و`now()` داخل `[starts_on, ends_on]`؛ الإنهاء يكتب `status='terminated'` فيصبح كل استعلام لاحق مرفوضًا دون أي إبطال كاش. `marketing_leads` غير مرتبطة بحياة العقد وتبقى مقروءة للمالك.
5. **المدد** — `duration_timers` يُوسَّع بـ`subject_kind` جديدين: `marketing_contract` (تنبيه قبل `ends_on`) و`marketing_license` (تنبيه قبل انتهاء الرخصة)، مع أنواع إشعارات جديدة عبر `private.emit_notification`.
6. **التدقيق** — توسيع `permission_audit_log.object_type` بـ`marketing_profiles`, `marketing_contracts`, `marketing_versions`, `marketing_packages`.

## الدوال

محروسة، `security definer`, `search_path=public`, فحص `auth.uid()` أولًا، ثم `private.can`:

`create_marketing_profile`, `set_marketing_profile_status`, `create_marketing_contract`, `set_marketing_contract_amounts`, `activate_marketing_contract`, `terminate_marketing_contract`, `create_marketing_version`, `approve_marketing_version`, `link_marketing_asset`, `issue_marketing_package`, `revoke_marketing_package`, `record_marketing_lead`, `update_marketing_lead_stage`.

دالة عامة واحدة بدور `anon` (استثناء مقصود ثانٍ بعد `verify_report` و`get_public_entity_profile`):

`public.verify_marketing_package(_token text)` — بناء JSON صريح حقلًا حقلًا (لا `to_jsonb(row)`)، وتعيد فقط: رقم الحزمة، اسم المشروع التسويقي، اسم جهة التسويق، رقم الترخيص، `expires_at`، والحالة (`valid` \| `expired` \| `revoked`). **بلا أي uuid، بلا سعر، بلا بيانات عملاء، بلا معرّفات داخلية.** لا وجود ⇒ `null` موحّد.

## الواجهة

- `src/routes/_authenticated/projects.$projectId.marketing.tsx` — لوحة المالك: حالة الجاهزية، الإصدارات واعتمادها، العقود ومبالغها، الوحدات، الأصول المعتمدة، إصدار الحقائب، والعملاء المحتملون.
- `src/routes/_authenticated/marketing.index.tsx` — لوحة المسوّق: عقوده السارية فقط، الملف المعتمد للقراءة، تسجيل العملاء المحتملين. لا روابط لأي وحدة أخرى.
- `src/routes/mp.$token.tsx` — صفحة تحقق عامة من الحقيبة (نمط `verify.$token.tsx`)، هدف رمز QR، مع وسوم SEO/OG بالحقول العامة فقط.
- `src/lib/marketing.functions.ts` — طبقة `createServerFn`؛ الدالة العامة بلا `requireSupabaseAuth`، والباقي بها.
- إعادة استخدام `dashboard-kit` والهوية الخضراء القائمة.

## بوابة القبول الحية (حسابات `p22-*@example.com` وكيانات/مشاريع اختبار جديدة حصرًا)

1. ملف تسويق لمشروع نشط بلا متطلبات البيع على الخارطة ⇒ رفض `MARKETING_PROJECT_NOT_READY`؛ ولمشروع مغلق باستلام نهائي ⇒ نجاح؛ ولمشروع نشط برخصة بناء + وافي ساريتين ⇒ نجاح.
2. المسوّق المتعاقد يقرأ الملف المعتمد بنجاح؛ ثم محاولات حية على `contracts`, `finance`, `reports`, `stages`, `documents` لنفس المشروع ⇒ رفض كامل. يُرفق ناتج `private.can` لكل وحدة إثباتًا لانحصار الفرع الجديد في `marketing`.
3. المسوّق يحاول تعديل السعر/الوصف مباشرة (UPDATE على الجدول و`approve_marketing_version`) ⇒ رفض؛ المالك يعتمد إصدارًا جديدًا ⇒ يظهر للمسوّق فورًا والسابق `superseded`.
4. قبل الإنهاء: قراءة ناجحة. بعد `terminate_marketing_contract`: نفس الاستعلام ⇒ رفض؛ و`marketing_leads` تبقى مقروءة للمالك (عدد الصفوف قبل/بعد).
5. حقيبة خارجية: إصدار برقم وصلاحية ورمز؛ `verify_marketing_package` بدور `anon` حقيقي ⇒ `valid`؛ بعد تعديل `expires_at` إلى الماضي ⇒ `expired`؛ بعد السحب ⇒ `revoked`؛ ورمز غير موجود ⇒ `null`.
6. رخصة فال منتهية للمسوّق ⇒ `issue_marketing_package` ترفض بـ`MARKETER_LICENSE_INVALID`، ولا يوجد مسار يصف الحملة بأنها مرخصة.
7. فحص تسرّب على استجابة `verify_marketing_package` الخام: بزرع سعر وبريد عميل محتمل ومعرّفات، ثم مطابقة نصية ⇒ صفر تسرّب.

## بعد كل migration

سحب `execute` عن `PUBLIC` و`anon` لكل دالة جديدة في المخططين (`public` و`private`) ثم منح صريح، وسحب صلاحيات الجداول الزائدة، وإرفاق ناتج `pg_proc.proacl` و`pg_class.relacl` قبل/بعد. لا يُمس أي حساب أو كيان دائم ولا `admin@rakeez.app`.
