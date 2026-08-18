# المرحلة 20 — تقرير تدقيق إدارة ركيز الداخلية (قراءة فقط)

لم يُعدَّل أي ملف ولم تُطبَّق أي مهاجرة. كل بند أدناه مسنود بدليل من ملفات المشروع الحالية؛ وما لا يمكن إثباته بسبب SUPABASE_FORBIDDEN مذكور صراحة.

## 1) جدول Traceability — المرحلة 20 (منطق الإدارة)

| بند الخطة | الحالة | الدليل | المخاطر | الإجراء المقترح |
| --- | --- | --- | --- | --- |
| فصل موظفي المنصة عن أعضاء المشاريع | مكتمل مثبت (كود) | `supabase/migrations/20260815120628_...sql` (جدول `platform_staff`، `private.is_platform_staff`, `private.platform_role`, `private.platform_can`) | لا يمكن إثبات التطبيق الفعلي في القاعدة | تحقق تنفيذي بعد عودة صلاحية Supabase |
| طابور مراجعة موحّد (توثيق كيانات، قوالب، بلاغات، دعم) | جزئي | نفس المهاجرة: `private.upsert_queue_item`, `tg_entity_verification_queue`, `tg_template_import_queue`, `tg_request_queue_close` | مصادر البلاغات/الدعم غير مثبتة كمحفّزات | جرد مصادر الطابور المفقودة وإضافتها |
| توزيع أعمال آلي متوازن | مكتمل مثبت (كود) | `public.auto_assign_queue_item` يفلتر `availability='available'` و`load < max_concurrent` | لا واجهة تُظهر التوازن/الحمل الحالي للمشرف | عرض الحمل في صفحة workforce |
| حالات الموظف (متاح/مشغول/إجازة/موقوف) | مكتمل مثبت (كود) | `public.platform_availability` enum + `set_platform_staff_state` | — | — |
| إعادة التوزيع والتدقيق | مكتمل مثبت (كود) | `public.reassign_queue_item(_item_id,_to_user,_reason)` + كتابة تدقيق | لا واجهة إعادة توزيع مؤكدة | ربط زر إعادة توزيع في queue |
| منع وصول موظف المنصة الكامل لمشاريع العملاء | جزئي | `private.can(...)` يمنح staff `view` فقط عبر `20260815134537_...sql:166` | يجب التحقق أن `view` مقيّد بحالة case فعلية | مراجعة فرع staff في `private.can` |
| وصول case-based مؤقت | مكتمل مثبت (كود) | `public.grant_case_access(...,_minutes,_reason)` / `revoke_case_access` | انتهاء الصلاحية غير مثبت تشغيليًا | اختبار انتهاء المدة |
| break-glass بسبب/موافقة/تدقيق | مكتمل مثبت (كود) | `request_breakglass` / `approve_breakglass` / `deny_breakglass` + `platform.breakglass.tsx` | لا يوجد دليل على تنبيه فوري للمالك | إضافة إشعار عند الموافقة |
| اختبارات: عدم إسناد مزدوج، إجازة، حد تشغيلي، إغلاق العمل عند معالجة الأصل | غير منفذ | لا توجد اختبارات في `src/lib` سوى `platform-access.test.ts` (18 سطرًا) | ادعاء نجاح بلا دليل | دفعة اختبارات مخصصة |

## 2) متطلبات المستخدم الأخيرة (لوحة المدير)

| البند | الحالة | الدليل |
| --- | --- | --- |
| هيدر إدارة مستقل | مكتمل مثبت | `src/components/platform-shell.tsx` |
| زر «الانتقال إلى الموقع العام» | مكتمل مثبت | `platform-shell.tsx:81` |
| زر «الإدارة» في الواجهة العامة للـsuperadmin | مكتمل مثبت | `src/components/app-shell.tsx:225-243` |
| عدم المرور باختيار الحساب | مكتمل مثبت (كود) | `src/routes/select-account.tsx` + `src/lib/platform-access.ts` |
| مصدر صلاحية خادمي واحد | جزئي | `getPlatformMe` في `src/lib/platform-admin.functions.ts:76` يقرأ الجدولين مباشرة، بينما تعرّف المهاجرة `public.platform_me()` غير مستخدم | ازدواج مصدر — يُوحَّد |
| المستخدمون كصفحة إدارة | جزئي | `platform.user.$userId.tsx` عرض فقط + fallback `source:"directory"` بلا عضويات | لا إجراءات إدارية فعلية |
| الكيانات كصفحة إدارة | جزئي | `platform.entity.$entityId.tsx` نفس النمط |
| الطلبات | جزئي — خطر ازدواج منخفض | `platform.requests.tsx:18` يستخدم `listQueueItems` نفسه؛ لا نظام موازٍ، لكنه لا يعرض `request_id` الأصلي ولا يفتح تفاصيل الطلب |
| الاستديو | بنية معلنة فقط | `platform.studio.tsx`: رابط حقيقي واحد `/admin/report-templates` و4 عناصر موسومة «غير مفعّل» |
| queue | مكتمل جزئيًا | `platform.queue.tsx` (318 سطرًا) موصول |
| workforce (فريق المنصة) | جزئي | `platform.staff.tsx` (164) يعرض الفريق؛ تعديل الحالة/الحد يحتاج تحققًا |
| integrations | مكتمل مثبت | `platform.integrations.tsx` + مهاجرة `20260815150124` |
| DSR | مكتمل مثبت | `platform.dsr.tsx` + `20260815172514` |
| breach plan | ثابت (محتوى نصي فقط) | `platform.breach-playbook.tsx` نص Markdown بلا ربط بجدول `data_incidents` |
| audit | جزئي | جداول تدقيق موجودة بلا شاشة عرض إدارية |
| روابط ميتة | لا يوجد | كل عناصر `platform-shell` لها ملف route فعلي |

## 3) المهاجرة المعلقة 08 — مراجعة أمنية (لا تُطبَّق الآن)

`supabase/migrations-pending/08_admin_user_entity_detail.sql`:
- SECURITY DEFINER + `set search_path = public` + فحص `private.is_platform_admin(auth.uid())` أولًا: سليم، والدالة موجودة فعلًا في `20260815083840_...sql:21`.
- `revoke ... from public, anon` ثم `grant ... to authenticated`: مطابق لقاعدة المشروع.
- ملاحظتان قبل التطبيق: الدالة تقرأ `auth.users` مباشرة (مقبول لكونها definer، ويجب ألا تعيد `raw_user_meta_data` — وهي لا تفعل)، و`search_path` لا يشمل `private` رغم استدعاء `private.is_platform_admin` — الاستدعاء مؤهَّل بالكامل فلا كسر، لكن يُفضّل `set search_path = public, private` صراحةً.

## 4) دين الحوكمة

خالفت دفعات سابقة قاعدة «Plan ثم اعتماد ثم Build»: أُنشئت `platform-shell.tsx`، صفحتا التفاصيل، `platform.studio.tsx`، `platform.requests.tsx`، ومسار fallback في `adminGetUser/adminGetEntity` قبل تدقيق معتمد. لا يُحذف العمل؛ يُسجَّل كدين ويُدخَل ضمن دفعات 20A فما بعد للتحقق.

## 5) الأولويات

- **P0**: توحيد مصدر الصلاحية على `public.platform_me()`؛ تطبيق المهاجرة 08 (يتطلب صلاحية Supabase)؛ إزالة fallback الصامت الذي يُظهر تفاصيل ناقصة بلا تمييز واضح؛ اختبارات صلاحيات superadmin مقابل مستخدم عادي.
- **P1**: إجراءات إدارية فعلية في صفحة المستخدم/الكيان؛ ربط «الطلبات» بمعرّف الطلب الأصلي وفتح تفاصيله؛ شاشة سجل التدقيق؛ ربط breach playbook بجدول `data_incidents`.
- **P2**: عرض حمل الموظفين وإعادة التوزيع من الواجهة؛ توسيع الاستديو عند توفر backend.

## 6) دفعات البناء المقترحة (لا تُنفَّذ الآن)

- **20A — توحيد الصلاحية**: `getPlatformMe` عبر `platform_me()` فقط، fail-closed. قبول: superadmin يدخل، مستخدم عادي يُمنع من كل `/platform/*` وRPC. rollback: إرجاع ملف واحد.
- **20B — تفعيل 08 وتفاصيل حقيقية**: تطبيق المهاجرة ثم حذف fallback. قبول: عضويات المستخدم تظهر؛ غير المدير يحصل على FORBIDDEN. rollback: `drop function`.
- **20C — إجراءات إدارية**: تعليق/تفعيل عضوية، تغيير حالة كيان، عبر RPC مدقّقة. قبول: كل إجراء يكتب سجل تدقيق؛ السلبي: staff غير superadmin يُمنع.
- **20D — الطلبات والتدقيق**: ربط عنصر الطابور بالطلب الأصلي + شاشة سجل تدقيق للقراءة.
- **20E — اختبارات المرحلة 20**: عدم الإسناد المزدوج، الإجازة، الحد التشغيلي، إغلاق العمل عند معالجة الأصل.

## 7) ما يحتاج صلاحية Supabase فعلية

المهاجرات المعلقة 01–08، وأي إثبات لـRLS/GRANT/RPC في الإنتاج، وأي إجراء إداري جديد في 20C/20D. حتى ذلك الحين تبقى هذه البنود «غير قابلة للتحقق».

توقفت هنا كما طُلب: لا بناء ولا مهاجرة ولا نشر.
