# المرحلة 12 — الطلبات والمحادثة الموحدة

## 1. الهدف
طبقة "طلب" عامة (`requests`) تصلح أساسًا لكل أنواع الطلبات لاحقًا (خدمات في المرحلة 13، صرف مالي في المرحلة 16)، بحيث:
- رقم الطلب واحد ثابت طوال دورة حياته.
- كل نقاش الطلب يجري في سلسلة مراسلات واحدة من المرحلة 10 — بدون جدول محادثة موازٍ.
- التذكير أو طلب الاستكمال = رسالة جديدة + تغيير حالة، وليس طلبًا جديدًا.

## 2. ما هو موجود فعلًا (تم التحقق منه)
- `correspondence_threads`: `project_id` (إلزامي)، `contract_id`، `stage_id`، `subject`، `status`، `created_by`، توقيتات.
- `correspondence_messages`: `thread_id`، `author_id`، `body`، `file_path`، `visibility` بقيد `shared | party_limited | internal_note`، `created_at` — لا تحديث ولا حذف (append-only).
- `correspondence_message_audience`: تحديد جمهور محدد للرسالة (مستخدم أو كيان).
- `permission_audit_log`: قيد `object_type` يسمح حاليًا بـ20 نوعًا، لا يتضمن `requests`؛ قيد `action` يسمح بـ `insert/update/revoke/delete/status_change`.

النتيجة: `correspondence_messages` كافٍ للمرسل والوقت والرؤية والمرفق. الناقص فقط: **دور المرسل وقت الإرسال** (يُشتق حاليًا ولا يُحفظ)، ودعم أكثر من مرفق لرسالة واحدة.

## 3. الجداول الجديدة

### `request_types` (مرجعي، قابل للتوسعة بلا migration جديدة لكل نوع)
`code` (PK نصي)، `name_ar`، `name_en`، `module` (app_module)، `requires_stage`، `requires_unit`، `is_active`، ترتيب العرض.
تُزرع أنواع المرحلة 12 الأساسية فقط: `info_request`، `document_request`، `approval_request`، `general_request`. المرحلتان 13 و16 تضيفان صفوفًا لا جداول.

### `requests`
- `id`، `request_no` (مسلسل قابل للعرض ثابت مدى الحياة)
- `request_type_code` → `request_types`
- `project_id` (إلزامي)، `stage_id`، `contract_id`، `property_id`، `property_unit_id` (كلها nullable وتُتحقق حسب نوع الطلب)
- `requested_by`، `assigned_entity_id`، `assigned_user_id`
- `status`: `draft | submitted | in_review | info_needed | approved | rejected | cancelled | closed`
- `priority`: `low | normal | high`
- `due_at`، `closed_at`، `closure_reason`
- `thread_id` → `correspondence_threads` **UNIQUE وNOT NULL** — علاقة 1:1 تمنع تعدد سلاسل الطلب الواحد
- توقيتات + `set_updated_at`

### `request_status_transitions` (آلة الحالة كبيانات لا كشيفرة)
`from_status`، `to_status`، `actor_scope` (`requester | handler | either`) — تمنع القفزات غير المسموحة، وتُقرأ من الـtrigger.

لا جدول رسائل جديد إطلاقًا.

## 4. تعديلات محدودة على جداول قائمة
- `correspondence_messages`: إضافة `author_role_snapshot` (نص، دور المرسل لحظة الإرسال) و`message_kind` (`comment | reminder | info_request | decision | system`) — لتمييز التذكير عن الرد العادي داخل نفس السلسلة.
- `correspondence_message_attachments` (جدول ملحق صغير) لدعم أكثر من مرفق: `message_id`، `file_path`، `file_name`، `mime`، `size_bytes`. يبقى `file_path` القديم للتوافق.
- `permission_audit_log`: توسعة قيد `object_type` بـ `requests` و`request_messages`.
- لا تغيير على قيم `visibility` — الملاحظات الداخلية تستخدم `internal_note` الموجود كما هو.

## 5. الأمن (RLS ومحرك القرار)
- `private.can_access_request(_request_id)`: مسموح إذا كان المستخدم من داخل المشروع (`private.can(... 'projects','view', project)`)، أو مقدّم الطلب، أو الجهة المسندة إليه (مستخدم أو كيان طرف نشط في المشروع ضمن نطاق المرحلة).
- `requests`: قراءة عبر الدالة أعلاه؛ إنشاء لمن يملك `create` على وحدة نوع الطلب؛ تعديل عبر RPC فقط؛ لا حذف (إلغاء = حالة `cancelled`).
- سلسلة الطلب ترث نفس منطق المرحلة 10: `internal_note` لا تصل لمقدم الطلب الخارجي ولا لأي طرف خارجي — الاختبار يثبتها من حساب مقدم الطلب نفسه.
- `request_types` و`request_status_transitions`: قراءة للمصادَقين، كتابة `service_role` فقط.
- GRANT صريح لكل جدول جديد؛ لا `anon`.

## 6. الدوال (RPC)
- `create_request(...)` → ينشئ السلسلة والطلب معًا في معاملة واحدة، ويكتب أول رسالة `shared`.
- `post_request_message(_request_id, _body, _visibility, _kind, _attachments)` → رسالة داخل نفس السلسلة + لقطة دور المرسل.
- `request_reminder(_request_id)` و`request_more_info(_request_id, _body)` → **رسالة + تحديث حالة فقط**، ممنوع إنشاء طلب جديد؛ الثاني ينقل الحالة إلى `info_needed`.
- `decide_request(_request_id, _approve, _note)` → `approved`/`rejected` مع رسالة قرار.
- `close_request(_request_id, _reason)`.
- كل انتقال حالة يمر عبر `request_status_transitions` ويُسجَّل في `permission_audit_log` (`object_type='requests'`, `action='status_change'`) — سجل غير قابل للطمس.

## 7. طبقة التطبيق والواجهة
- `src/lib/requests.functions.ts`: `listRequests`, `getRequest`, `listRequestTypes`, `createRequest`, `postRequestMessage`, `sendReminder`, `requestMoreInfo`, `decideRequest`, `closeRequest`, `listRequestTimeline`.
- مسارات:
  - `/_authenticated/projects/$projectId/requests` — قائمة مع فلترة بالحالة والنوع.
  - `/_authenticated/requests/$requestId` — صفحة الطلب.
- تصميم صفحة الطلب: **شريط "الإجراء المطلوب الآن"** أعلى الصفحة (زر واحد أساسي حسب دور المستخدم والحالة)، ثم المحادثة، ثم Timeline مطوي مصدره `permission_audit_log`. الملاحظة الداخلية بشارة واضحة ولا تظهر أصلًا لغير المخوّلين.
- مفاتيح i18n عربية/إنجليزية في `src/i18n/locales/*` تحت `requests.*`.

## 8. ترتيب التنفيذ
1. Migration: `request_types` + `request_status_transitions` + `requests` + GRANT + RLS + السياسات.
2. Migration: توسعة `correspondence_messages` + جدول المرفقات + توسعة قيد `permission_audit_log`.
3. Migration: دوال `private.can_access_request` وRPCs والـtriggers والتدقيق.
4. زرع أنواع الطلبات وقواعد الانتقال.
5. `src/lib/requests.functions.ts` + i18n + المسارين.
6. Supabase Advisors ومعالجة أي Finding جديد.

## 9. اختبارات التحقق (بحسابات `p12-*`)
1. تذكير + طلب استكمال لا ينشئان طلبًا ثانيًا: `count(requests)` يبقى 1 والسلسلة تبقى واحدة.
2. ملاحظة داخلية غير مرئية لمقدم الطلب ولا لطرف خارجي، ومرئية لداخل المشروع.
3. انتقال حالة غير مسموح (مثل `draft → approved`) يُرفض من الـtrigger.
4. كل تغيّر حالة يظهر في `permission_audit_log` ولا يقبل تعديلًا أو حذفًا.
5. مستخدم خارج المشروع لا يرى الطلب ولا سلسلته إطلاقًا.
6. طلب بنوع يتطلب مرحلة يُرفض بدون `stage_id`.

بعد الاختبارات: حذف كامل لكل مستخدمي وبيانات `p12-*` مع استعلام `count` فعلي يُلصق في التقرير.
