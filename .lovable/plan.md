# المرحلة 17 — الإشعارات والمدد والتصعيد

## المبدأ الحاكم

متابعة ذكية بلا ضجيج: كل إشعار له **مصدر حدث واضح** داخل قاعدة البيانات (تريغر على تغيّر حالة فعلي، أو مهمة زمنية واحدة محدودة الغرض للتذكيرات/التأخير)، ولكل إشعار **مفتاح تفرّد حقيقي** بفهرس فريد. لا رابط يحمل صلاحية: الرابط معرّفات فقط، والتحقق يحدث عند النقر.

## ما هو موجود فعلًا ويُعاد استخدامه (مفحوص في الملفات لا مفترضًا)

| الأصل الموجود | الاستخدام في المرحلة 17 |
|---|---|
| `public.financial_executions.idempotency_key` + `financial_executions_idem_uk` (فهرس فريد) | نفس النمط حرفيًا: `notifications.dedupe_key` + فهرس فريد، لا `select` مسبق |
| `private.can(_user, _module, _action, _entity, _project)` و`private.can_access_project` | تحديد من يستحق الإشعار ومن يستحق التصعيد، ويُعاد تقييمه **عند فتح الرابط** |
| `private.can_view_project_finance` | إشعارات المالية لا تحمل أي مبلغ في نصّها؛ الرقم يُرى داخل الصفحة فقط لمن يملك `finance.view` |
| `getDocumentDownloadUrl` (روابط موقّعة 60 ثانية، فحص عند الإصدار) | نفس المبدأ منقولًا إلى النقر: `resolve_notification_target` تُقيَّم لحظة الفتح |
| `requests.due_at`, `requests.status` (`draft/submitted/in_review/info_needed/approved/rejected/cancelled/closed`), `decided_at`, `closed_at` | عداد «مدة الرد على الطلب»: يبدأ عند `submitted`، يتوقف عند `info_needed`، يستأنف عند العودة إلى `in_review`، ينتهي عند `decided_at`/`closed_at` |
| `project_stages.planned_start/planned_end/actual_start/actual_end/status` (`pending/in_progress/submitted/rework/approved/skipped/done`) | عداد «مدة تنفيذ المرحلة»: من `actual_start` (أو `planned_start`) حتى `planned_end`؛ يتوقف في `submitted` (بانتظار المراجع) ويستأنف في `rework` |
| `payment_milestones.due_date` + `status` (`planned/claimable/claimed/settled/cancelled`) | عداد «استحقاق دفعة»: تذكير قبل `due_date`، تأخير بعده ما لم تكن `settled/cancelled` |
| `retention_holds.expected_release_date` + `status` | عداد «سريان ضمان/محتجز»: تذكير قبل الإفراج المتوقع، تأخير بعده وهو `active/partially_released` |
| `contract_extensions` (`requested/under_review/approved/rejected/withdrawn`) و`contracts.status` (فيها `suspended`) | تمديد المدة يعيد حساب العداد بدل إنشاء تاريخ جديد؛ عقد `suspended` يوقف عدادات مشروعه |
| `entity_memberships.status` و`entity_invitations` | حالة `suspended` للعضوية = لا إشعار فعّال ولا رابط فعّال |
| `permission_audit_log` + `private.log_finance_event` | تسجيل قرارات الرفض عند فتح رابط بلا صلاحية |
| `prevent_row_mutation()` | سجل التسليم/التصعيد append-only |

**قاعدة ملزمة:** لا حقل تاريخ استحقاق جديد في هذه المرحلة. كل عدّاد يشتق من الحقول أعلاه. الحقل الجديد الوحيد المسموح هو تاريخ **حالة العدّاد** (توقف/استئناف) لأنه غير موجود.

---

## 1) نموذج البيانات

**`notification_types`** (مرجعي ثابت): `code` PK، `category` ∈ `action_required | reminder | overdue | escalation | security | info`، `default_channel='in_app'`، `is_mandatory` bool، `is_security` bool، `subject_key`/`body_key` (مفاتيح i18n لا نص مخزَّن)، `target_kind` ∈ `request | stage | milestone | disbursement | document | financial_document | retention | contract`.
- الإلزامي/الأمني (`is_mandatory` أو `is_security`) **لا يُعطَّل** بأي تفضيل ولا يدخل الـDigest.

**`notifications`** (رأس، بلا نص مبني مسبقًا وبلا أي مبلغ):
`id`, `recipient_user_id`, `type_code`, `project_id`, `entity_id`, `target_kind`, `target_id`, `payload` jsonb (معرّفات وأرقام مرجعية فقط — **ممنوع** مبالغ أو مواقع دقيقة أو أسماء مخفية)، `severity`, `dedupe_key` text not null, `created_at`, `read_at`, `dismissed_at`, `escalation_of_id`.
- `create unique index notifications_dedupe_uk on public.notifications(dedupe_key);`
- `dedupe_key` مبني حتميًا: `type_code || ':' || target_id || ':' || event_discriminator || ':' || recipient_user_id` — حيث `event_discriminator` هو مثلًا `idempotency_key` للتنفيذ المالي، أو `version_no` للمستند، أو `bucket` التذكير (`due-3d`, `overdue-d7`).
- الإدراج دائمًا عبر `private.emit_notification(...)` مع `on conflict (dedupe_key) do nothing`. إعادة المحاولة لا تنشئ صفًا ثانيًا.

**`notification_deliveries`** (append-only): `notification_id`, `channel` ∈ `in_app | email | sms`، `status` ∈ `pending | sent | deferred | suppressed | failed`، `deferred_reason` (`user_suspended`, `digest_batched`, `preference_off`)، `attempted_at`, `sent_at`.
- في هذه المرحلة يُنفَّذ `in_app` فقط. `email/sms` يُقبلان كقيمة عمود وتبقى صفوفهما `pending` — **لا تكامل مع أي مزوّد بريد/SMS، خارج النطاق صراحة**.

**`notification_preferences`**: `user_id`, `type_code` (أو `category`), `in_app` bool, `digest_mode` ∈ `immediate | daily | weekly | off`.
- تريغر يرفض تخزين `off` لأي نوع `is_mandatory` أو `is_security` (يرمي `22023`) — الاستثناء مفروض في القاعدة لا في الواجهة.

**`notification_digests`**: `user_id`, `period_start/end` (بحدود يوم الرياض), `sent_at`, `item_count`, وفهرس فريد `(user_id, period_start, digest_mode)`.

**`duration_timers`** (العدّاد المشتق المُجسَّد): `subject_kind` ∈ `request | stage | milestone | retention`، `subject_id`، `project_id`، `started_at`, `due_at` (منسوخ من الحقل الأصلي لا مُخترع)، `paused_at`, `resumed_at`, `total_paused_seconds`, `stopped_at`, `state` ∈ `running | paused | stopped`.
- فريد على `(subject_kind, subject_id)`.
- يُحدَّث حصريًا بتريغرات على `requests` / `project_stages` / `payment_milestones` / `retention_holds`، مع `due_at` معاد اشتقاقه عند اعتماد `contract_extensions` أو عند `contracts.status='suspended'` (توقف) والعودة إلى `active` (استئناف).

**`escalation_policies`** + **`escalation_steps`**: مرتبطة بـ`contract_id` (وإلا افتراضي حسب `project_parties.party_role`): `step_no`, `after_hours`, `target_role` ∈ `supervisor | project_manager | entity_owner`, `target_party_role`.
- **لا خطوة تصعيد إلى إدارة ركيز**. تريغر يمنع أي `target_role` خارج أطراف المشروع/العقد. تصعيد المنصة يحدث فقط بفعل بشري صريح لاحقًا (خارج نطاق 17).

**`escalation_events`** (append-only): `notification_id`, `policy_step_id`, `escalated_to_user_id`, `reason`, `created_at`، مع `dedupe_key` فريد (`step + subject + bucket`) لمنع تكرار نفس الدرجة.

## 2) التوقيت — Asia/Riyadh

- التخزين `timestamptz` بالـUTC حصرًا. لا عمود `timestamp` بلا منطقة.
- كل اشتقاق حدودي (بداية اليوم، «قبل ٣ أيام»، نافذة الـDigest) يمرّ بدالة واحدة `private.riyadh_day_bounds(_ts)` و`private.riyadh_now()` تستخدمان `at time zone 'Asia/Riyadh'`.
- التذكيرات تُجدول عند ساعة رياضية ثابتة (٠٨:٠٠ Asia/Riyadh) — لا ساعة UTC عشوائية.
- الواجهة تعرض دائمًا بتوقيت الرياض عبر مُنسّق موحّد في `src/components/rakeez/` (بنمط `money.ts`).

## 3) مصادر الأحداث (لا Cron عشوائي)

**فوري بتريغر على تغيّر حالة حقيقي:**
- `requests`: `submitted` → إشعار للمكلَّف؛ `info_needed` → إشعار «طلب استكمال» لمقدّم الطلب؛ قرار → إشعار للطرفين.
- `project_stages`: `submitted` → للمراجع؛ `rework` → للمنفّذ؛ `approved` → للمالك.
- المالية (16-أ/ب): `disbursement_requests` عند كل انتقال، و`financial_executions` باستخدام `idempotency_key` نفسه كـ`event_discriminator`؛ `financial_documents` عند `issued`/`cancelled`؛ `retention_events` عند الإفراج/المصادرة. النص بلا مبالغ.
- تعليق عضوية أو إنهاء طرف → إشعار أمني (`is_security`, غير قابل للتعطيل).

**مجدول (مهمة واحدة محدودة الغرض، `pg_cron` كل ساعة تستدعي `private.run_duration_sweep()`):**
- `Reminder`: عند دخول `due_at` نافذة `-7d/-3d/-1d` بتوقيت الرياض، و`state='running'` فقط.
- `Overdue`: عند تجاوز `due_at` وحالة العدّاد `running` → إشعار + بدء ساعة التصعيد.
- `Escalation`: عند تجاوز `after_hours` للخطوة التالية دون معالجة.
- كل نداء يبني `dedupe_key` بـ`bucket` ثابت، فتكرار تشغيل الـsweep لا يولّد صفًا ثانيًا.

## 4) أمان الرابط والمستخدم الموقوف

- الإشعار يخزّن `target_kind` + `target_id` فقط. رابط الواجهة `/n/$notificationId`.
- `public.resolve_notification_target(_notification_id)` (SECURITY DEFINER) تتحقق **لحظة النداء**: المستلم هو `auth.uid()`، العضوية `active`، و`private.can` تسمح بالوصول للهدف الآن.
- عند أي فشل: رسالة واحدة عامة `NOT_FOUND_OR_FORBIDDEN` — لا تفرقة بين «غير موجود» و«ممنوع»، ولا كشف اسم مشروع أو رقم مستند. المحاولة تُسجَّل في `permission_audit_log`.
- عضوية `suspended`: `emit_notification` يكتب الصف لكن التسليم `deferred` بسبب `user_suspended`؛ لا يظهر في الصندوق، و`resolve_notification_target` ترفض. عند إعادة التفعيل تُسلَّم المؤجلات.

## 5) طبقة التطبيق والواجهة

- `src/lib/notifications.functions.ts`: `listNotifications`, `getUnreadCount`, `markRead`, `markAllRead`, `resolveNotificationTarget`, `getPreferences`, `updatePreferences`, `listTimers` — كلها بـ`requireSupabaseAuth` وقراءة عبر RLS (لا `supabaseAdmin`).
- جرس في `auth-header.tsx` بعدّاد غير المقروء + لوحة منسدلة.
- `/notifications` (صندوق + فلاتر)، `/settings/notifications` (تفضيلات مع الإلزامي معطّل الإيقاف ومشروح)، و`/n/$notificationId` (تحويل أو رسالة عامة).
- شارات المدد داخل صفحات الطلب/المرحلة/المالية: «متبقٍ ٣ أيام» / «متأخر ٥ أيام» بتوقيت الرياض.
- i18n كامل ar/en، RTL، مفاتيح فقط لا نصوص مخزّنة في القاعدة.

## 6) خارج النطاق صراحة

مزوّدو البريد/SMS والدفع الفعلي للقنوات، Push/Web-Push، تصعيد تلقائي لإدارة ركيز، محرك SLA تعاقدي قابل للتحرير من المستخدم، وأي حقل تاريخ استحقاق جديد.

---

## التقسيم المقترح (كما في 15 و16)

**الدفعة 17-أ — الإشعارات والروابط الآمنة:** `notification_types`, `notifications`, `notification_deliveries`, `notification_preferences`, `emit_notification`, `resolve_notification_target`, تريغرات الأحداث الفورية، الجرس والصندوق وصفحة التفضيلات.

**الدفعة 17-ب — المدد والتصعيد والـDigest:** `duration_timers` وتريغرات التوقف/الاستئناف، `run_duration_sweep` والتذكير/التأخير، `escalation_policies/steps/events`, `notification_digests`, شارات المدد في الواجهة.

## بوابة القبول (تُنفَّذ لاحقًا بحسابات `p17a-*` / `p17b-*@example.com` جديدة فقط)

1. نفس الحدث مرتين (إعادة تشغيل التريغر/الـsweep) ⇒ صف إشعار واحد فقط (`dedupe_key`).
2. تنفيذ صرف بنفس `idempotency_key` مرتين ⇒ إشعار واحد.
3. حسابات المدد والتذكير عند حدّ يوم رياضي (٢٣:٣٠ رياض) تعطي اليوم الصحيح، والتخزين UTC.
4. `info_needed` يوقف العدّاد والعودة إلى `in_review` تستأنفه دون احتساب فترة الوقوف.
5. مستخدم `suspended`: لا إشعار مسلَّم، ورابطه مرفوض؛ وبعد التفعيل تصل المؤجلات.
6. رابط لمورد فقد المستخدم صلاحيته بعده ⇒ رسالة عامة موحّدة، وتطابق حرفي مع رسالة مورد غير موجود.
7. تفضيلات: إيقاف نوع اختياري ينجح؛ إيقاف نوع إلزامي/أمني يُرفض من القاعدة بخطأ.
8. التصعيد يمشي المشرف ← مدير المشروع ← مالك الكيان، ولا يصل أي إشعار لحساب إدارة ركيز.
9. عضو بلا `finance.view` يرى إشعارًا ماليًا بلا أي مبلغ في النص وفي الصفحة.
