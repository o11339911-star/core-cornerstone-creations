# الدفعة 17-ب — المدد والتصعيد والملخص التجميعي

## تصحيح مهم قبل البدء (مفحوص في القاعدة، لا مفترض)

فحصتُ `pg_proc` للمخططين `private` و`public`: **لا وجود لأي دالة `private.riyadh_now()` أو `private.riyadh_day_bounds()`**. توقيت الرياض مُطبَّق حاليًا في طبقة الواجهة فقط (`src/lib/riyadh-time.ts`). لذلك أول خطوة في هذه الدفعة هي إنشاء هاتين الدالتين كمصدر زمني وحيد في القاعدة (بدل بناء منطق موازٍ داخل كل تريغر) — وهذا موافق لروح طلبك: مصدر زمني واحد، لا منطق مكرّر.

## الموجود فعلًا ويُعاد استخدامه كما هو

| الأصل | الاستخدام في 17-ب |
|---|---|
| `private.emit_notification(...)` (idempotent، `on conflict (dedupe_key) do nothing`، تسجيل `notification_deliveries`) | **كل** إشعار مدة/تصعيد/Digest يمر عبرها حصرًا — لا `insert` مباشر في `notifications` |
| `notifications.escalation_of_id` (موجود ومعطّل الاستخدام حتى الآن) | ربط إشعار التصعيد بالإشعار الأصلي |
| `notification_preferences.digest_mode` (`immediate/daily/weekly/off`) | مدخل منطق الـ Digest |
| `notification_types.is_mandatory` / `is_security` | الاستثناء الأمني من التجميع |
| `private.can(...)`, `private.can_access_project/stage/request` | تحديد المستلم، وفلترة محتوى الـ Digest **وقت البناء** |
| `prevent_row_mutation()` | جعل `escalation_events` سجلًا append-only |
| حقول المدد القائمة: `requests.due_at/status`, `project_stages.planned_start/planned_end/actual_start/actual_end/status`, `payment_milestones.due_date/status`, `retention_holds.expected_release_date/status` | مصدر `due_at` لكل عداد — **لا حقل تاريخ استحقاق جديد يُخترع** |

---

## 1) الزمن: مصدر واحد

- `private.riyadh_now() returns timestamptz` — `now()` مُعبَّرًا عنه بمنطقة `Asia/Riyadh`.
- `private.riyadh_day_bounds(_at timestamptz) returns record(day_start, day_end)` — حدود اليوم بتوقيت الرياض بصيغة `timestamptz` (تحويل `at time zone 'Asia/Riyadh'` ثم العودة).
- كلاهما `stable`, `security definer`, `set search_path = public`، والتنفيذ ممنوح لـ `authenticated` فقط عند الحاجة (يُستدعيان أساسًا من دوال definer).
- أي حساب «قبل الاستحقاق بـ N أيام» أو «تأخير بعد N أيام» يُبنى على حدود يوم الرياض لا على UTC.

## 2) عدادات المدد — `duration_timers`

أعمدة: `id`, `subject_kind` ∈ `request | stage | milestone | retention`, `subject_id`, `project_id`, `entity_id`, `started_at`, `due_at` (منسوخ من الحقل الأصلي)، `paused_at`, `total_paused_seconds` int default 0, `stopped_at`, `state` ∈ `running | paused | stopped`, `last_pre_due_bucket`, `last_overdue_bucket`, `created_at/updated_at`.
- فريد على `(subject_kind, subject_id)`.
- **الكتابة حصرًا عبر تريغرات** على `requests` / `project_stages` / `payment_milestones` / `retention_holds`:
  - بدء: `requests.status → submitted`، `project_stages.actual_start`، إنشاء `payment_milestone`/`retention_hold` بتاريخ استحقاق.
  - إيقاف مؤقت: `requests.status = info_needed` (انتظار رد الطرف الآخر)، `project_stages.status = submitted` (بانتظار المراجع)، عقد `suspended`.
  - استئناف: العودة إلى `in_review` / `rework` → يُضاف الفارق إلى `total_paused_seconds` ويُصفَّر `paused_at`.
  - إيقاف نهائي: `decided_at/closed_at`, `approved/done/skipped`, `settled/cancelled`, إفراج الضمان.
- إعادة اشتقاق `due_at` عند اعتماد `contract_extensions` (لا تاريخ جديد مُخترع).
- دالة `private.timer_elapsed_seconds(timer)` تحسب الوقت الفعّال (مستثنيًا فترات التوقف).

### أنواع إشعارات جديدة في `notification_types`
`duration.pre_due` (reminder، اختياري)، `duration.overdue` (overdue، إلزامي)، `duration.completion_requested` (action_required، إلزامي)، `escalation.raised` (escalation، إلزامي).

### مُشغّل الفحص الدوري
- `public.run_duration_scan()` — `security definer`، تُستدعى من مسار `/api/public/cron/duration-scan` محميّ بسرّ HMAC/توكن في الرأس (نمط `public-api-endpoints`)، مع إمكانية تشغيلها يدويًا في الاختبار.
- لكل عداد `running` مستحق: تنبيه `pre_due` عند دخول نافذة (`due-3d`, `due-1d`) وتنبيه `overdue` عند (`overdue-d1`, `overdue-d3`, `overdue-d7`) — اسم النافذة هو الـ `discriminator` في `emit_notification`، فلا تكرار حتى لو تكرر تشغيل الفحص.
- التوقف المؤقت يمنع تقدّم النوافذ (الحساب على الوقت الفعّال).
- المستلمون: المسؤول عن الموضوع (assignee/responsible/approver عبر `stage_roles` و`requests.assignee`) فقط، ولا حمولة تحمل مبالغ.

## 3) التصعيد — سياسة صريحة فقط

- `escalation_policies`: `id`, `entity_id`, `project_id` nullable, `subject_kind`, `contract_id` nullable, `trigger_after_hours`, `is_active`, `created_by`.
- `escalation_steps`: `policy_id`, `step_no`, `delay_hours`, `target_kind` ∈ `stage_role | project_party_role | user`, `target_role` (مثل `approver`/`supervision`), `target_user_id` nullable. **لا قيمة تعني «إدارة ركيز»**، ولا افتراض عند غياب السياسة.
- `escalation_events` (append-only عبر `prevent_row_mutation`): `timer_id`, `policy_id`, `step_no`, `resolved_recipient_user_id`, `notification_id`, `raised_at`, `reason`.
- منطق `run_duration_scan` للتصعيد: يبحث عن سياسة نشطة مطابقة `(subject_kind, project_id/contract_id, entity_id)`. **إن لم تُوجد سياسة ⇒ لا شيء إطلاقًا** (لا صف، لا إشعار) — عدم وجود سياسة ليس خطأ بل سلوك آمن مقصود.
- عند وجود سياسة: يُحلّ المستلم من `target_kind` (دور في `stage_roles` أو `project_parties`، أو مستخدم محدد). إن تعذّر الحل ⇒ لا تصعيد ويُسجَّل السبب في `escalation_events` بدون مستلم بديل.
- إشعار التصعيد عبر `emit_notification` بنوع `escalation.raised` مع `escalation_of_id` = الإشعار الأصلي، و`discriminator = policy_id:step_no`.

## 4) الملخص التجميعي — Digest

- `notification_digests`: `user_id`, `digest_mode`, `period_start`, `period_end` (حدود يوم/أسبوع الرياض)، `item_count`, `built_at`, `sent_at`؛ فريد `(user_id, digest_mode, period_start)`.
- `notification_digest_items`: `digest_id`, `notification_id`، فريد `(digest_id, notification_id)`.
- تعديل `private.emit_notification`: بدل الرفض الحالي عند `digest_mode <> 'immediate'`، تُنشأ الإشعار ويُسجَّل التسليم `deferred` بسبب `digest_batched` — **إلا** إذا كان `is_mandatory` أو `is_security` فيبقى `sent` فورًا مهما كان التفضيل. (`digest_mode='off'` مع `in_app=false` يبقى منعًا كاملًا للاختياري فقط.)
- `public.build_notification_digest(_user_id, _mode)`: تجمع الإشعارات المؤجلة داخل نافذة الرياض، وتُعيد تقييم الصلاحية **وقت البناء** لكل عنصر (`private.can_access_project` / `can_access_*` حسب `target_kind`) وتُسقط ما لا يُصرّح به الآن، ثم تحوّل تسليماتها إلى `sent`.
- شرط مُبرمج داخل بناء الـ Digest نفسه: `where not (t.is_mandatory or t.is_security)` — الاستثناء مُنفَّذ في مكانين مستقلين (الإصدار والبناء) لا في تريغر التفضيلات وحده.

## 5) الأمان والصلاحيات (إلزامي قبل التسليم)

- RLS مفعّلة على كل جدول جديد، مع سياسات قراءة فقط للمستفيد: `duration_timers` لمن يملك وصول المشروع؛ `escalation_policies/steps` لمن يملك `members.manage_members` أو إدارة المشروع؛ `escalation_events` قراءة للمستلم وإدارة المشروع؛ `notification_digests/items` للمالك فقط.
- كل الكتابة عبر تريغرات/دوال `security definer` مع `set search_path = public` وإعادة فحص `auth.uid()` والصلاحية داخل الدالة (عدا الدوال التي تُستدعى من التريغرات فقط، وهي مُصفَّرة الصلاحيات على `public`).
- **بعد كل migration:** استعلام `information_schema.role_table_grants` لكل جدول جديد، ثم:
  ```sql
  revoke insert, update, delete, truncate on public.<t> from anon, authenticated;
  revoke select on public.<t> from anon;
  ```
  الجداول الوحيدة التي قد تحتفظ بكتابة مباشرة من `authenticated` هي `escalation_policies`/`escalation_steps` إن سمحت سياسة RLS بذلك صراحةً؛ خلاف ذلك تُسحب. أُرفق ناتج الاستعلام في التقرير النهائي.
- `revoke execute ... from anon, authenticated` على دوال المسح الدوري، مع منح `service_role` فقط.

## 6) طبقة التطبيق

- `src/lib/durations.functions.ts`: `listProjectTimers`, `listEscalationPolicies`, `upsertEscalationPolicy`, `listEscalationEvents`, `buildMyDigest` — جميعها `createServerFn` مع `requireSupabaseAuth` (نمط `notifications.functions.ts`).
- `src/routes/api/public/cron/duration-scan.ts`: نقطة الفحص الدوري بتحقق سرّ في الرأس.
- واجهة: قسم «المدد والتصعيد» داخل صفحة المشروع (عدادات + حالتها + سجل التصعيد)، وتوسعة `settings.notifications` بخيار وضع الـ Digest وعرض الملخص المبني.
- i18n عربي/إنجليزي لكل النصوص الجديدة.

## 7) بوابة القبول الحية (بحسابات `p17b-*@example.com` وكيان اختبار جديد فقط)

1. عداد يبدأ ويتوقف ويُستأنف؛ تحقق من `total_paused_seconds` وصحة حدود الرياض عبر `private.riyadh_day_bounds`.
2. `duration.pre_due` ثم `duration.overdue` فعليان لعداد حقيقي، مع تشغيل الفحص مرتين لإثبات عدم التكرار.
3. تصعيد وفق سياسة صريحة ⇒ المستلم هو المحدَّد في `escalation_steps` (يُثبَت بمقارنة `resolved_recipient_user_id`).
4. عداد متأخر بلا سياسة مطابقة ⇒ صفر صفوف في `escalation_events` وصفر إشعارات تصعيد.
5. مستخدم `digest_mode='daily'`: إشعار أمني/إلزامي ⇒ تسليم `sent` فورًا.
6. نفس المستخدم: إشعار اختياري ⇒ `deferred/digest_batched`، ثم يظهر داخل الـ Digest بعد البناء، مع إسقاط عنصر فقد صلاحيته وقت البناء.

**ضمانة البيانات:** لا مساس بالحسابات الخمسة عشر الدائمة ولا `admin@rakeez.app` ولا أي كيان حقيقي؛ كل الاختبارات على كيان `p17b` جديد فقط.

## نطاق مستبعد صراحة
بريد إلكتروني/SMS فعلي، أي مزوّد خارجي، أي تصعيد افتراضي إلى إدارة المنصة، وأي حقل تاريخ استحقاق جديد خارج الحقول القائمة.
