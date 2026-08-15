# المرحلة 18 — الاستلام والإغلاق والضمان والأرشفة

## ما تم التحقق منه فعليًا قبل كتابة الخطة (لا افتراض)

- `public.projects` يحتوي `status text` و`deleted_at`، ولا يحتوي أي حقل إغلاق/استلام/أرشفة — فهذه تُضاف في هذه المرحلة.
- `public.project_templates` يحتوي `code`, `feature_flag`, `requires_license` — وهو المرتكز لاختلاف قائمة الإغلاق حسب نوع المشروع.
- `public.duration_timers` قائم فعليًا بأعمدة `subject_kind, subject_id, project_id, entity_id, contract_id, started_at, due_at, paused_at, total_paused_seconds, stopped_at, state, last_pre_due_bucket, last_overdue_bucket` — يستوعب الضمانات بإضافة قيمة `warranty` إلى `subject_kind` فقط، **بدون أي عمود جديد ولا نظام مدد مواز**.
- `public.escalation_policies` يقبل `subject_kind` نصيًا، فتنطبق عليه سياسات ضمان دون تغيير بنيوي.
- `public.permission_audit_log` قائم بالحقول `actor_user_id, object_type, object_id, action, old_value, new_value` — يُعاد استخدامه لأثر إعادة الفتح بدل سجل تدقيق جديد.
- `public.documents` + `document_categories` + `document_versions` قائمة بنظام إصدارات ورؤية — تُستخدم كما هي لشهادة الإشغال وكتيبات O&M ووثائق الضمان (فقط إضافة تصنيفات جديدة).
- `prevent_row_mutation()` موجودة وتُستخدم كنمط append-only.

---

## 1) قائمة تحقق الإغلاق حسب نوع المشروع

- `closure_checklist_templates`: `id`, `project_template_id` (FK)، `code`, `name_ar/en`, `phase` ∈ `provisional | final`, `is_required`, `requires_document_category` nullable, `order_index`, `is_active`.
  - تُزرع بنودًا واقعية لكل نوع مشروع قائم (بناء/ترميم/إشراف…): «تسليم المخططات كما نُفّذت»، «شهادة إشغال»، «كتيبات O&M»، «إقرار تسوية مالية» إلخ.
- `project_closure_items`: نسخة تشغيلية لكل مشروع: `project_id`, `template_item_id`, `code`, `phase`, `is_required`, `status` ∈ `pending | satisfied | waived`, `document_id` nullable, `satisfied_by`, `satisfied_at`, `waiver_reason`.
  - تُنشأ تلقائيًا عبر تريغر عند بدء أول استلام، من قالب نوع المشروع — لا إدخال يدوي حر.
  - `waived` يتطلب سببًا نصيًا إلزاميًا وصلاحية إدارة المشروع، ويُسجَّل في `permission_audit_log`.

## 2) دورة الاستلام — ابتدائي ثم نهائي

- `project_acceptances`: `id`, `project_id`, `phase` ∈ `provisional | final`, `status` ∈ `draft | requested | inspected | accepted_with_defects | accepted | rejected`, `requested_by`, `requested_at`, `inspected_by`, `inspected_at`, `decided_by`, `decided_at`, `decision_note`, `certificate_document_id` nullable.
  - فريد جزئي: استلام واحد غير مُنتهٍ لكل `(project_id, phase)`.
  - انتقالات الحالة عبر جدول `acceptance_status_transitions` + تريغر `enforce_acceptance_flow` (نفس نمط `enforce_request_status_flow` القائم) — لا تحديث حر للحالة.
  - **فصل واجبات**: `requested_by ≠ decided_by` مفروض بتريغر، لا بالواجهة.
  - **قيد النهائي**: لا يمكن فتح `final` قبل وجود `provisional` بحالة `accepted` أو `accepted_with_defects`.
  - RPCs: `request_acceptance(_project_id,_phase)`, `record_acceptance_inspection(...)`, `decide_acceptance(_id,_decision,_note)`.

## 3) النواقص — Punch List

- `punch_items`: `project_id`, `acceptance_id` nullable, `stage_id` nullable, `title`, `description`, `severity` ∈ `minor | major | critical`, `raised_by`, `raised_at`, `assigned_party_id` (FK `project_parties`) / `assigned_user_id`, `due_at`, `status` ∈ `open | in_progress | submitted | verified | rejected | closed`, `closed_by`, `closed_at`.
- `punch_item_evidence`: `punch_item_id`, `kind` ∈ `before | after`, `document_id` (FK) أو مسار تخزين، `uploaded_by`, `created_at` — append-only.
  - **قيد صريح**: الانتقال إلى `verified` يتطلب وجود دليل `before` ودليل `after` على الأقل؛ و`closed_by ≠ assigned_user_id` (من عالج ≠ من تحقق).
- **إغلاق النواقص لا يُغلق المشروع**: لا تريغر يُغيّر حالة المشروع تلقائيًا عند آخر بند؛ الإغلاق قرار منفصل صريح دائمًا.
- **العكس مفروض**: `close_project()` ترفض إن وُجد `punch_items` بحالة ليست `closed` أو `rejected` — رسالة خطأ صريحة.

## 4) شهادة الإشغال والضمانات وكتيبات O&M

- تصنيفات مستندات جديدة في `document_categories`: `occupancy_certificate`, `om_manual`, `warranty_certificate`, `as_built` — تسير في نظام المستندات والإصدارات والرؤية القائم بلا استثناء.
- `warranties`: `id`, `project_id`, `entity_id`, `scope_kind` ∈ `system | component | whole_project`, `title`, `system_code` nullable, `provider_kind` ∈ `contractor | supplier`, `provider_party_id` (FK `project_parties`) nullable, `provider_name` نصي احتياطي، `warranty_type` ∈ `workmanship | material | equipment | structural`, `starts_on date`, `ends_on date`, `document_id` nullable, `status` ∈ `active | expired | void`, `created_by`.
  - قيد تحقق: `ends_on > starts_on` (تريغر تحقق، لا CHECK زمني).
- `warranty_claims` (اختياري داخل النطاق): `warranty_id`, `raised_by`, `description`, `status` ∈ `open | accepted | rejected | resolved` — بلا أي قيمة مالية.

## 5) تنبيهات انتهاء الضمان — إعادة استخدام كامل للمرحلة 17

- تريغر على `warranties` يُنشئ صفًا في **`duration_timers`** بـ `subject_kind='warranty'`, `subject_id=warranty.id`, `due_at = ends_on` (بحدود يوم الرياض عبر `private.riyadh_day_bounds`), `state='running'`؛ ويوقفه عند `void`/`expired`.
- **لا جدول مدد جديد، لا كرون جديد، لا دالة مسح جديدة**: `public.run_duration_scan()` تُوسَّع لتشمل `warranty` ضمن نفس منطق النوافذ، مع نوافذ أطول ملائمة للضمان: `pre_due` عند `due-90d`, `due-30d`, `due-7d`، و`overdue-d1` (انتهى الضمان).
- أنواع إشعارات جديدة فقط في `notification_types`: `warranty.pre_expiry` (reminder، اختياري)، `warranty.expired` (overdue، إلزامي) — تُصدر حصرًا عبر `private.emit_notification` بـ `discriminator` = اسم النافذة، فلا تكرار.
- التصعيد: يعمل تلقائيًا إن أنشأ الكيان سياسة `escalation_policies` بـ `subject_kind='warranty'`؛ **وإلا لا تصعيد** (نفس قاعدة 17-ب المثبتة).
- المستلمون: مالك المشروع وأطراف المشروع ذات الصلاحية، وحمولة الإشعار بلا أي مبلغ.

## 6) الأرشيف Read-only بعد الإغلاق

- إضافة إلى `projects`: `closed_at`, `closed_by`, `closure_note`, `archived_at`, `reopened_count int default 0`، وقيمتَي حالة `closed` و`archived`.
- `public.close_project(_project_id,_note)` — `security definer`، تعيد فحص `auth.uid()` و`private.can(...,'projects','update'/'approve')`، وترفض إن:
  - لا يوجد استلام نهائي بحالة `accepted`، أو
  - بند إلزامي في `project_closure_items` غير `satisfied/waived`، أو
  - نواقص مفتوحة.
- دالة حارسة مشتركة `private.assert_project_open(_project_id)` + تريغر `guard_closed_project` يُركَّب على جداول الكتابة الرئيسة (`project_stages`, `requests`, `documents`, `punch_items`, `contracts`, `payment_milestones`, `disbursement_requests`, `warranties`, `project_parties`, `reports`, `site_visits`) — أي `insert/update/delete` على مشروع `closed/archived` يُرفض على مستوى القاعدة، ليس الواجهة.
  - استثناء وحيد ومحكم: الكتابة القادمة من مسار إعادة الفتح المعتمد (تُميَّز عبر متغيّر جلسة داخلي تضبطه دالة إعادة الفتح فقط).
- القراءة تبقى كاملة حسب RLS القائمة — الأرشيف مقروء لا مُعدَّل.

## 7) إعادة الفتح المقيدة

- `project_reopen_requests`: `project_id`, `requested_by`, `reason` (`not null`, طول أدنى مفروض)، `requested_at`, `status` ∈ `pending | approved | rejected`, `decided_by`, `decided_at`, `decision_note`, `expires_at`.
  - **فصل واجبات بتريغر**: `decided_by ≠ requested_by` وإلا رفض.
  - **سبب إلزامي**: لا صف بلا سبب — قيد `not null` + تريغر طول.
- `public.approve_project_reopen(_request_id,_note)`: تعيد فحص الصلاحية، تُعيد `projects.status` إلى `in_progress`، تمسح `closed_at/archived_at`، تزيد `reopened_count`، وتكتب صفًا في **`permission_audit_log`** (`object_type='project_reopen'`, `action='reopen_approved'`, `old_value/new_value` بالحالة قبل/بعد) — أثر تدقيق كامل: من طلب، من وافق، متى، ولماذا.
- `project_reopen_requests` بعد البتّ تصبح غير قابلة للتعديل عبر `prevent_row_mutation()` (سجل قرار ثابت).

## 8) سابقة الأعمال — Portfolio

- `portfolio_entries`: `id`, `entity_id`, `project_id` **`not null` + `unique`** مع FK إلى `projects`, `title_ar/en`, `summary_ar/en`, `project_type_code`, `city`, `district`, `completed_on`, `is_public`, `published_by`, `published_at`.
  - **منع الإدخال اليدوي غير الموثّق بقيد لا بواجهة**: `project_id` إلزامي، والكتابة المباشرة مسحوبة تمامًا من `authenticated`؛ الإنشاء حصرًا عبر `public.publish_portfolio_entry(_project_id, ...)` التي ترفض ما لم يكن المشروع `closed/archived` بعد استلام نهائي `accepted`.
  - **فلترة مالية صريحة**: الجدول لا يحتوي أي عمود مبلغ/عملة/مدة تعاقدية مالية؛ ودالة النشر لا تقرأ إطلاقًا من `*_amounts` أو `payment_milestones` أو `financial_documents` أو `ledger_*`. تريغر `enforce_portfolio_no_financial_leak` يفحص نصوص `title/summary` ضد نمط أرقام مالية/عملة ويرفض.
  - **لا مرفقات خاصة**: `portfolio_assets` يقبل فقط مستندات بحالة `approved` و`visibility='public_approved'` من `documents`؛ أي مستند آخر يُرفض بتريغر. لا روابط تخزين خام.
- عرض عام لاحقًا يقرأ من `portfolio_entries` فقط، لا من جداول المشروع.

## 9) الأمان والصلاحيات (إلزامي قبل التسليم)

- RLS مفعّلة على كل جدول جديد بمنع افتراضي، والقراءة مقيدة بـ `private.can_access_project(...)`/`private.can(...)`، وسابقة الأعمال العامة عبر سياسة `select` ضيقة على `is_public = true` فقط.
- كل `security definer` تُعيد فحص `auth.uid()` والصلاحية داخلها مع `set search_path = public`.
- **بعد كل migration مباشرة ودون طلب**: تشغيل استعلام `information_schema.role_table_grants` لكل جدول جديد، ثم:
  ```sql
  revoke insert, update, delete, truncate on public.<t> from anon, authenticated;
  revoke select on public.<t> from anon;   -- عدا portfolio_entries/assets العامة
  ```
  و`revoke execute` على الدوال الداخلية من `anon, authenticated` مع منح `service_role` حيث يلزم. تُرفَق نتيجة الفحص **قبل وبعد** في التقرير النهائي.

## 10) طبقة التطبيق

- `src/lib/closure.functions.ts`: قائمة التحقق، الاستلامات، النواقص وأدلتها، الإغلاق، إعادة الفتح.
- `src/lib/warranties.functions.ts`: الضمانات والمطالبات وربط العدادات (قراءة من `duration_timers` القائمة).
- `src/lib/portfolio.functions.ts`: نشر وقراءة سابقة الأعمال.
- مسارات: `/projects/$projectId/closure` (تبويبات: قائمة التحقق، الاستلام، النواقص)، `/projects/$projectId/warranties`، `/entities/$entityId/portfolio`.
- شارة «مؤرشف/مغلق» تعطّل أزرار التحرير — طبقة تجميلية فوق منع القاعدة، لا بديلًا عنه.
- i18n عربي/إنجليزي لكل النصوص الجديدة.

## 11) بوابة القبول الحية (`p18-*@example.com` وكيان/مشروع جديدان فقط)

1. استلام ابتدائي ينتج `accepted_with_defects` مع بندَي نقص → رفع دليل قبل/بعد → `verified` ثم `closed` → استلام نهائي `accepted`.
2. استدعاء `close_project` ونقص مفتوح موجود ⇒ رفض بخطأ صريح (يُلتقط نصه).
3. ضمان بـ `ends_on` قريب ⇒ صف في `duration_timers` بـ `subject_kind='warranty'` ⇒ تشغيل `run_duration_scan` ⇒ إشعار `warranty.pre_expiry` فعلي، وتشغيل ثانٍ لا يُنتج تكرارًا.
4. بعد الإغلاق: محاولة `update` مباشرة على `project_stages`/`documents` للمشروع ⇒ رفض من القاعدة (وليس من الواجهة).
5. إعادة فتح: بلا سبب ⇒ رفض؛ نفس الشخص يطلب ويوافق ⇒ رفض؛ سبب + موافق مختلف ⇒ نجاح مع صف في `permission_audit_log` يحمل من/متى/لماذا.
6. `publish_portfolio_entry` لمشروع مغلق ⇒ نجاح، والصف لا يحمل أي رقم مالي ولا أي مستند غير `public_approved`؛ ومحاولة إدخال سابقة أعمال بلا `project_id` أو لمشروع غير مغلق ⇒ رفض.

**ضمانة البيانات:** لا مساس بالحسابات الخمسة عشر الدائمة ولا `admin@rakeez.app` ولا أي مشروع حقيقي؛ كل شيء داخل كيان `p18` جديد.

## نطاق مستبعد صراحة

نظام مدد أو تنبيهات مواز، أي قيمة مالية داخل سابقة الأعمال، صفحة عامة للسابقة خارج التطبيق، تكامل جهات إصدار شهادات الإشغال الرسمية، ومهمة `pg_cron` مجدولة (تبقى كما في 17-ب: مسار محميّ بسرّ يستدعيه مُجدول خارجي).
