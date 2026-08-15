# المرحلة 26 — المتطلبات النظامية والخصوصية (جاهزية إطلاق لا صفحات شكلية)

## 0) المبدأ الحاكم
كل ما يُكتب هنا مشتق من بنية المنصة الفعلية: صفوف سجل المعالجة وDPIA تسمّي الجداول والدوال والقيود الحقيقية الموجودة في القاعدة (مثل `private.can`, `entity_public_profiles`, `property_exact_locations`, `media_asset_versions`, `integration_registry`, `sanitize_error`). لا نص عام منسوخ. وتنويه إلزامي — تقني/تشغيلي يحتاج مراجعة مستشار نظامي سعودي — يظهر في التقرير وفي الصفحات القانونية.

**ملاحظة على الوضع القائم (متحقَّق منه):** لا توجد اليوم صفحة تسجيل حساب ذاتي — `src/routes/auth.index.tsx` دخول فقط، والانضمام عبر `invite.accept.tsx`. لذلك «القبول عند التسجيل» يُنفَّذ في نقطتين: قبول السياسات ضمن قبول الدعوة، وبوابة قبول إلزامية عند الدخول لأي مستخدم لم يقبل النسخة السارية. كذلك لا يوجد اليوم أي checkbox مسبق التحديد في التطبيق (فحص شامل) عدا مربع «مقروء فقط» معطّل توضيحي في `projects.new.tsx` — سيوثَّق كغير موافقة.

## 1) القاعدة — migration واحدة (CREATE → GRANT → RLS → POLICY → REVOKE)

### `legal_documents` + `legal_document_versions`
- `legal_documents`: `code` (`privacy`, `terms`, `ip`, `complaints`) فريد، `title_ar`, `slug`.
- `legal_document_versions`: `document_id`, `version` (نص مثل `1.0`)، `body_md`, `effective_date`, `published_at`, `requires_acceptance bool`, `is_current bool` — فهرس فريد جزئي على `(document_id) where is_current`.
- قراءة: **عامة** لـ`anon`+`authenticated` للنسخ المنشورة فقط (`published_at is not null`) — هذه الصفحات عامة بالتصميم. الكتابة: موظفو المنصة عبر دوال SECURITY DEFINER.

### `policy_acceptances`
`user_id`, `document_id`, `version_id`, `accepted_at`, `ip_hash`, `user_agent_hash`, `context` (`invite_accept`/`login_gate`) — فريد `(user_id, version_id)`. المستخدم يقرأ صفوفه فقط؛ موظفو المنصة يقرأون الكل. الكتابة عبر `accept_policies(_version_ids uuid[])` فقط.
- دالة `pending_policy_acceptances()` تُرجع النسخ السارية `requires_acceptance` التي لم يقبلها المستخدم ⇒ محرّك بوابة الدخول.
- **موافقات منفصلة**: صف قبول مستقل لكل وثيقة — لا موافقة واحدة تغطي أغراضًا متعددة.

### `data_processing_register`
الأعمدة: `activity_code` فريد، `module app_module`, `purpose_ar`, `legal_basis_ar`, `data_categories text[]`, `subject_categories text[]`, `recipients text[]`, `retention_period_ar`, `retention_months int`, `deletion_mechanism_ar`, `backing_objects text[]` (أسماء الجداول/الدوال الحقيقية)، `cross_border bool default false`, `active bool`.
يُملأ بصفوف واقعية تغطي: الحسابات والملفات الشخصية، الكيانات والعضويات والدعوات، المشاريع والمراحل والزيارات (مواقع دقيقة)، العقود والمستندات، المالية والدفتر، المراسلات والطلبات، الإشعارات، التسويق والملفات العامة، الوسائط 360، السوق والمواعيد والتجارة، التكاملات الرسمية، وسجلات التدقيق والصلاحيات.

### `dpia_register` + `dpia_controls`
`dpia_register`: `module`, `scope_ar`, `risk_level` (`high`/`medium`)، `risks jsonb`, `residual_risk_ar`, `assessed_at`, `review_due_at`, `assessed_by`.
`dpia_controls`: `dpia_id`, `control_type` (`rls_policy`/`db_function`/`constraint`/`trigger`/`app_guard`)، `object_name` (الاسم الحقيقي في القاعدة)، `description_ar`, `effectiveness_ar`.
تُملأ للوحدات عالية المخاطر القائمة فعلًا: المالية (SoD)، المواقع الدقيقة (`property_exact_locations`, `enforce_visit_location_consent`)، الهويات المقنّعة، الوسائط 360 (التمويه اليدوي وسحب الروابط)، التكاملات (`sanitize_error`, حارس الأسرار).

### `dsr_requests` (+ `dsr_request_events`)
`dsr_requests`: `user_id`, `kind` (`access`/`rectification`/`erasure`/`export`)، `status` (`submitted`→`identity_verification`→`in_review`→`fulfilled`/`partially_fulfilled`/`rejected`/`closed`)، `details_ar`, `identity_verified_at`, `identity_method`, `decision_ar`, `restriction_reasons text[]`, `result_ref` (مرجع التصدير)، `queue_item_id`, `due_at`, `closed_at`.
- تريغر `enforce_dsr_status_flow` بجدول انتقالات صريح (على نمط `enforce_request_status_flow` القائم).
- `dsr_request_events` سجل تدقيق append-only لكل انتقال مع الفاعل والسبب.
- المدد عبر `duration_timers` القائمة: مؤقّت يبدأ عند التقديم بموعد استحقاق 30 يومًا ويتوقف عند الإغلاق.
- مصدر طابور جديد `dsr_request` يُضاف إلى نوع `platform_queue_source`، وينشئ عنصر طابور تلقائيًا عند التقديم.
- **قيد الحذف**: `evaluate_erasure_constraints(_user_id)` تفحص العضويات النشطة، أطراف المشاريع، العقود السارية، والقيود المالية/الدفترية وتُرجع أسبابًا مهيكلة ⇒ القرار يصبح «تنفيذ جزئي مع تقييد موثق» بدل حذف أعمى.
- `export_my_data()` تعيد حزمة JSON من بيانات صاحب الطلب فقط (بالبناء على `export_entity_data` القائمة كنمط) موسومة بالتاريخ والنطاق.

### `data_incidents`
`title`, `severity` (`low/medium/high/critical`)، `detected_at`, `contained_at`, `affected_scope_ar`, `data_categories text[]`, `subjects_estimate int`, `root_cause_ar`, `notification_required bool`, `authority_notified_at`, `subjects_notified_at`, `status` (`open/contained/closed`)، `lessons_ar`. موظفو المنصة فقط قراءةً وكتابةً عبر دوال.

### الوصول والصلاحيات (إلزامي في نفس الـmigrations)
- فرع جديد في `private.can` لوحدة `privacy` يطابق **الوحدة والفعل معًا** (موظفو المنصة فقط للسجلات الإدارية؛ لا يرث أي دور مشروع شيئًا).
- لكل جدول جديد: `grant` بالحد الأدنى، ثم `revoke insert, update, delete, truncate on ... from anon, authenticated`، و`revoke select from anon` عدا `legal_documents(+versions)` المنشورة.
- كل دالة جديدة: `revoke execute ... from public` ثم منح صريح لـ`authenticated` (و`anon` فقط لقارئ الصفحات القانونية العام)، ثم تشغيل فحص دوال السياسات على `public` **و`storage.objects`** معًا وإرفاق ناتجه.

## 2) الدوال (SECURITY DEFINER)
`accept_policies`, `pending_policy_acceptances`, `get_legal_document(code)` (عامة)، `publish_legal_version`, `submit_dsr_request`, `verify_dsr_identity`, `decide_dsr_request`, `fulfil_dsr_request`, `close_dsr_request`, `list_my_dsr_requests`, `list_dsr_requests` (منصة)، `export_my_data`, `evaluate_erasure_constraints`, `log_data_incident`, `list_data_processing_register`, `list_dpia`.

## 3) التطبيق
- `src/lib/legal.functions.ts` — الصفحات القانونية + القبول + الحالة المعلّقة.
- `src/lib/dsr.functions.ts` — تقديم/متابعة/معالجة الطلبات والتصدير.
- المسارات العامة (بلا جلسة، head مستقل لكل واحدة): `/legal/privacy`, `/legal/terms`, `/legal/ip`, `/legal/complaints` — تعرض النسخة السارية مع رقم النسخة وتاريخ السريان، والتنويه القانوني ظاهرًا، وعرض Markdown بالهوية الخضراء وRTL.
- بوابة القبول: مكوّن في `src/routes/_authenticated/route.tsx` يعرض شاشة قبول إلزامية عند وجود نسخ معلّقة (قبول مستقل لكل وثيقة، بلا تحديد مسبق)، مع مثله داخل `invite.accept.tsx`.
- `/settings/privacy` للمستخدم: تقديم طلب DSR، متابعة الحالة والمدة، تنزيل حزمة التصدير، وعرض سجل قبولاته.
- `/platform/dsr` لموظفي المنصة: طابور طلبات الخصوصية، تحقق الهوية، القرار، الإغلاق الموثق.
- `/platform/privacy` (تبويب جديد): سجل المعالجة وDPIA وسجل الحوادث للعرض والتصفية.
- **مراجعة الموافقات القائمة**: تدقيق نقاط النشر العام، سابقة الأعمال، والتسويق للتأكد من الفصل وعدم التحديد المسبق، مع إصلاح أي انحراف في نفس الدفعة.
- وثيقة `.lovable/legal/breach-response-plan.md`: أدوار، عتبات الإخطار، خط زمني، قوالب الإخطار، وربطها بجدول `data_incidents`.
- `off_plan`: توثيق أن البيع على الخارطة يبقى مغلقًا بقيد المرحلة 22 كصف في سجل المعالجة/DPIA وكبند في شروط الاستخدام (متطلب ترخيص «وافي»).
- معيار ركيز الكامل في كل صفحة: skeleton مطابق للتخطيط، `SoftEmpty`، خطأ عربي بزر إعادة، بطاقات على الجوال، أرقام latn معزولة، صفر نص إنجليزي مسرّب.

## 4) بوابة القبول الحية (`p26-*@example.com` حصرًا، البيانات تبقى)
1. حساب `p26-user` جديد ⇒ صف قبول لكل وثيقة بنسخة محددة؛ نشر نسخة `1.1` للخصوصية ⇒ بوابة قبول جديدة عند الدخول.
2. طلب تصدير كامل: تقديم ← تحقق هوية ← عنصر طابور `dsr_request` ← تنفيذ بحزمة JSON ← إغلاق، مع مؤقّت `duration_timers` مسجَّل.
3. طلب حذف لحساب `p26-active` في مشاريع نشطة ⇒ `evaluate_erasure_constraints` تُرجع الأسباب، والقرار «تنفيذ جزئي مقيّد» موثق في `dsr_request_events`.
4. الصفحات القانونية الأربع تُفتح بجلسة anon حقيقية.
5. عدّ صفوف سجل المعالجة وDPIA وإرفاق مطابقتها لأسماء الكائنات الحقيقية.
6. فحص نقاط الموافقة: صفر checkbox مسبق التحديد.
7. فحص الصلاحيات: `role_table_grants` + `routine_privileges` + فحص دوال السياسات على `public` و`storage`.

## 5) خارج النطاق
لا حذف أو تعديل لأي بيانات دائمة أو `admin@rakeez.app`، ولا اعتماد قانوني نهائي — التنويه إلزامي في التقرير والصفحات.
