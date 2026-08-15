# المرحلة 16 — المالية والدفعات المرتبطة بالعقد

## الإطار القانوني (يُكتب في الواجهة نفسها لا في الخطة فقط)

ركيز **لا تحفظ أموالًا ولا تعالج مدفوعات ولا تقدّم خدمة مالية مرخّصة**. كل ما تبنيه هذه المرحلة هو **سجل تعاقدي ومحاسبي** يوثّق ما اتفق عليه الأطراف وما أقرّوا بحدوثه خارج المنصة. بند "الضمان/المحتجز/العربون" هو **تتبّع تعاقدي** فقط وليس Custody ولا Escrow. يظهر هذا نصًّا ثابتًا (شارة + سطر تنويه) في كل شاشة مالية، ويُخزَّن كذلك في وصف الجداول (`comment on table`) حتى لا يضيع المعنى عند قراءة قاعدة البيانات مباشرة.

## ما هو موجود ويُعاد استخدامه (لا يُكرَّر)

| الحاجة | الموجود فعلًا |
|---|---|
| فصل الواجبات | نمط `submitted_by` ≠ `approved_by` في `approve_stage` و`approve_report` و`approve_contract_version` |
| منع التعديل بعد التثبيت | `public.prevent_row_mutation()` + تريغر `before update or delete` |
| نمط الإصدارات للتصحيح | `contract_versions` / `report_versions` / `document_versions` |
| إخفاء المال | `private.can(_user, 'finance', 'view', …)` + مصفوفة `role_permissions` (المشرف/المقاول لا يملكان `finance.view`) + نمط جدول المبالغ المنفصل `contract_version_amounts` |
| سقف الطرف الخارجي | `private.party_ceiling` + `private.stage_in_scope` |
| إثبات الإنجاز | `project_stages.status='approved'` + `stage_progress` + `site_visits` |
| سجل التدقيق | `permission_audit_log` ونمط `audit_*_change` |

**قاعدة الإخفاء المعمارية المعتمدة:** كل مبلغ مالي يعيش في جدول `*_amounts` منفصل عن الجدول الرئيسي، وسياسة `select` عليه تشترط `private.can(auth.uid(),'finance','view',…)`. هكذا يرى المشرف/المقاول *وجود* الدفعة وحالتها ولا يرى *قيمتها* — إخفاء على مستوى RLS لا على مستوى الواجهة، ويصمد أمام استعلام مباشر عبر PostgREST.

## التقسيم المقترح (البناء على دفعتين)

المرحلة أكبر من بناء واحد آمن ومُختبَر. الحد الفاصل هو **دورة الصرف مقابل المحاسبة**:

- **الدفعة 16-أ — مراحل الدفع ودورة الصرف**: البنود 1، 2، 5، 7 + بوابة القبول الخاصة بالطلب/الاعتماد/التنفيذ/الرفض/إعادة التقديم/فصل الواجبات/idempotency/اختلاف الرؤية.
- **الدفعة 16-ب — المستندات المالية والدفتر المحاسبي والضمان**: البنود 3، 4، 6 + بوابة قبول التسوية بقيد عكسي.

الدفعة ب تعتمد على ب-فقط-بعد-أ لأن القيود المحاسبية تُولَّد من أحداث التنفيذ التي تنشئها الدفعة أ.

---

## الدفعة 16-أ — مراحل الدفع ودورة الصرف

### جداول

**`payment_milestones`** — دفعة مخطَّطة مرتبطة بالعقد وبمرحلة عمل.
- `contract_id`, `contract_version_id` (الإصدار المعتمد الذي أنشأها), `project_id`, `stage_id` (اختياري: قد تكون دفعة مقدّمة بلا مرحلة), `seq` (تسلسل داخل العقد), `title_ar/en`, `basis` (`on_stage_approval` | `on_date` | `manual`), `due_date`, `status` (`planned` | `claimable` | `claimed` | `settled` | `cancelled`).
- **لا مبلغ هنا.** المبلغ في `payment_milestone_amounts` (`amount`, `currency='SAR'`, `percent_of_contract` اختياري).
- قيود: `unique(contract_id, seq)`؛ مجموع نسب الدفعات ≤ 100% بتريغر (نفس أسلوب `enforce_owner_share_total`).
- بعد أول طلب صرف مرتبط بها لا تُعدَّل الدفعة ولا مبلغها (تريغر `prevent_row_mutation` مشروط) — التصحيح يتم بإلغاء الدفعة وإنشاء بديلة تشير إلى `supersedes_id`.

**`disbursement_requests`** — طلب صرف (الكيان الأساسي للدورة).
- `milestone_id`, `contract_id`, `project_id`, `stage_id`, `status`, `reason_text` (سبب الرفض), `resubmitted_from` (رابط لطلب مرفوض سابق), وأربعة أزواج فاعل/وقت: `requested_by/at`, `reviewed_by/at`, `approved_by/at`, `executed_by/at`.
- الحالات: `draft → submitted → under_review → approved → executed`، مع `rejected` (بسبب إلزامي) و`cancelled`. الانتقالات محروسة بتريغر `enforce_disbursement_status_flow` (نفس أسلوب `enforce_request_status_flow`).
- المبلغ المطلوب في `disbursement_request_amounts` (منفصل، محمي بـ `finance.view`): `gross_amount`, `retention_amount` (المحتجز), `net_amount` محسوب.

**`disbursement_evidence`** — إثبات الإنجاز المربوط بالطلب: مرجع إلى `stage_progress` أو `site_visits` أو `documents` (مستند موجود، لا رفع جديد). الطلب لا يُقدَّم إلا وله إثبات واحد على الأقل + مرحلة العمل بحالة `approved`.

**`financial_executions`** — سجل التنفيذ (append-only منذ لحظة الإنشاء).
- `request_id`, `idempotency_key` (نص، `unique(request_id, idempotency_key)` + فهرس فريد عام), `executed_by`, `executed_at`, `method` (`bank_transfer_offline` | `cheque` | `other` — كلها إقرارات خارج المنصة), `external_reference` (رقم حوالة يدخله المستخدم), `note`.
- تريغر `prevent_row_mutation` على `update`/`delete` — لا تصحيح إلا بقيد عكسي في 16-ب.

### الدوال (SECURITY DEFINER، كلها تعيد التحقق من الصلاحية داخلها)

`create_payment_milestone`, `cancel_payment_milestone`, `submit_disbursement_request`, `start_disbursement_review`, `reject_disbursement_request(_reason)`، `resubmit_disbursement_request`, `approve_disbursement_request`, `execute_disbursement(_request_id, _idempotency_key, …)`.

**الحاسم في البند 2 — الاعتماد لا يغيّر أي رصيد:**
- `approve_disbursement_request` تكتب `status='approved'` و`approved_by/at` **فقط**. ممنوع عليها لمس `payment_milestones.status` أو إنشاء أي صف في `financial_executions`.
- `payment_milestones.status='settled'` يُكتب حصريًا داخل `execute_disbursement`، ويحرسه تريغر `guard_milestone_settlement`: أي محاولة تحويل الدفعة إلى `settled` بدون وجود صف `financial_executions` مطابق لطلب معتمد **تُرفض على مستوى قاعدة البيانات** حتى لو جاءت من `service_role` أو من SQL مباشر.
- كل الجداول تُمنع من `insert/update` المباشر من `authenticated` (`grant select` فقط + `revoke insert/update/delete`)؛ كل كتابة تمر عبر الدوال. هذا يجعل الحارس غير قابل للالتفاف من الواجهة.

**فصل الواجبات (حقيقي لا شكلي):**
- `reviewed_by ≠ requested_by`
- `approved_by ∉ {requested_by, reviewed_by}`
- `executed_by ≠ approved_by`
- الاستثناء الوحيد المسموح: كيان بمستخدم واحد فقط (`owner`) — عندها تُرفض الدورة برسالة صريحة تطلب إضافة عضو ثانٍ، ولا "نتساهل" تلقائيًا. (قرار مقصود: لا باب خلفي.)
- الفحص داخل الدوال + تريغر تحقق نهائي على الصف قبل `executed`.

**Idempotency (البند 7):**
- `execute_disbursement` تأخذ `_idempotency_key` إلزاميًا (UUID يولّده العميل مرة واحدة عند فتح نموذج التنفيذ، لا عند كل ضغطة).
- المنطق: `insert into financial_executions … on conflict (idempotency_key) do nothing returning id`؛ إن لم يعد صف، تُقرأ التنفيذة القائمة وتُعاد **نفس** النتيجة بعلم `{ deduplicated: true }` بدل الخطأ.
- الفهرس الفريد هو الضمان الفعلي (يصمد أمام طلبين متزامنين)، لا فحص `select` مسبق.
- إثبات حي مطلوب: استدعاء `execute_disbursement` مرتين بنفس المفتاح (متسلسلًا ومتوازيًا) → صف تنفيذ واحد، `settled` مرة واحدة، والاستدعاء الثاني يعيد `deduplicated: true`.

### الصلاحيات (البند 5)

- `select` على `payment_milestones` و`disbursement_requests`: لكل من يصل للمشروع (`private.can_access_project`) وضمن سقف الطرف الخارجي (`stage_in_scope` للمقاول/المشرف).
- `select` على `*_amounts`: يشترط إضافةً `private.can(auth.uid(),'finance','view',null,project_id)`. المشرف والمقاول (`project_party_role in ('supervision','contractor','inspector')`) لا يحملون `finance.view` في `role_permissions` ولا في `party_ceiling`، فلا يرون القيمة إلا بـ `permission_grants` صريح ومؤقَّت.
- دوال الاعتماد والتنفيذ تشترط `finance.approve` و`finance.execute` (يُضاف `execute` لمصفوفة finance للأدوار `owner` فقط افتراضيًا).
- كل انتقال حالة يُسجَّل في `permission_audit_log` بنمط `audit_*_change` القائم.

### الواجهة

- `/projects/$projectId/finance` — جدول الدفعات (تسلسل، مرحلة العمل المرتبطة، الحالة، والمبلغ **أو** شارة "غير مصرّح بعرض القيمة")، ولوحة طلبات الصرف بحالاتها.
- `/projects/$projectId/finance/requests/$requestId` — الخط الزمني للدورة (طالب/مراجع/معتمد/منفّذ بأسمائهم ووقتهم)، الإثباتات المرتبطة، أزرار الخطوة التالية فقط لمن يملكها، ونموذج التنفيذ الذي يحمل `idempotency_key` مثبَّتًا في `useRef` عند فتحه.
- سطر تنويه ثابت: «سجل تعاقدي — ركيز لا تحفظ أموالًا ولا تنفّذ تحويلات».
- خادميًا: `src/lib/finance.functions.ts` بنمط `createServerFn` + `requireSupabaseAuth`، كل استدعاء عبر RPC، بلا أي منطق قرار في العميل.

### البند 8 — لا مفاتيح دفع

لا مزوّد دفع ولا مفاتيح ولا `VITE_*` مالية في هذه المرحلة إطلاقًا. `financial_executions.method` و`external_reference` مصمّمان ليستوعبا لاحقًا مرجع مزوّد خارجي، وأي تكامل فعلي (بوابة/مصرف) **خارج النطاق** ويُنفَّذ عندها في server function فقط بمفتاح من Secrets. يُكتب هذا كملاحظة في ADR، بلا سطر كود تحضيري.

### بوابة قبول 16-أ (اختبار حي بحسابات مؤقتة `p16a-*` فقط — لا الحسابات التوضيحية الدائمة ولا `admin@rakeez.app`)

1. دورة كاملة: تقديم → مراجعة → اعتماد → تنفيذ، بأربعة مستخدمين مختلفين، مع تحقق أن الرصيد/الحالة لم يتغيّرا عند الاعتماد وتغيّرا عند التنفيذ فقط.
2. رفض بسبب إلزامي (رفض بلا سبب → خطأ)، ثم إعادة تقديم تنشئ طلبًا جديدًا يشير إلى المرفوض.
3. فصل الواجبات: نفس المستخدم يحاول الاعتماد بعد التقديم → رفض من الدالة؛ ومحاولة التنفيذ من المعتمِد → رفض.
4. Idempotency: نفس المفتاح مرتين (متسلسل + متوازٍ) → تنفيذ واحد.
5. الرؤية: جلسة مقاول/مشرف تقرأ `*_amounts` مباشرة عبر supabase-js → صفر صفوف؛ وبعد `permission_grants` صريح → تظهر القيمة؛ وبعد انتهاء المنحة → تختفي.
6. الالتفاف: محاولة `update` مباشرة على `disbursement_requests` أو `insert` في `financial_executions` من جلسة مستخدم → مرفوضة (لا `grant`).
7. محاولة تحويل دفعة إلى `settled` بلا تنفيذ (SQL مباشر) → يرفضها التريغر.

---

## الدفعة 16-ب — المستندات المالية والدفتر المحاسبي والضمان

### مستندات مالية (البند 3)

`financial_documents`: `kind` (`invoice` | `credit_note` | `receipt`), `contract_id`, `project_id`, `milestone_id`/`request_id`, `doc_number` (عبر عدّاد لكل كيان بنمط `report_number_counters` القائم), `issue_date`, `status` (`draft` | `issued` | `superseded` | `void`), `current_version_id`.

`financial_document_versions` (append-only، بنمط `report_versions` حرفيًا — لا منطق إصدارات جديد): `subtotal`, `vat_rate`, `vat_amount`, `total`, `lines jsonb`, `issued_by/at`. التصحيح = إصدار جديد يُعلِّم السابق `superseded`، أو `credit_note` يشير إلى الفاتورة الأصلية عبر `references_document_id`. لا `update` على نسخة صادرة.

الضريبة: حقلا نسبة ومبلغ فقط (`vat_rate numeric(5,2)`, `vat_amount`) بحساب بسيط ومخزَّن — **لا محرك ضريبي ولا امتثال ZATCA ولا فاتورة إلكترونية معتمدة**، ويُذكر ذلك نصًّا في الواجهة.

المبالغ هنا أيضًا خلف `finance.view` (جدول النسخ نفسه محمي بالسياسة، والرأس `financial_documents` مرئي بلا أرقام).

### الضمان/المحتجز/العربون (البند 4)

`contract_holdbacks`: `contract_id`, `kind` (`retention` | `advance_guarantee` | `deposit`), `basis_percent` أو مبلغ (في `contract_holdback_amounts` المحمي), `hold_from`, `release_conditions_text`, `expected_release_date`, `status` (`held` | `partially_released` | `released` | `forfeited`), وسجل أحداث `holdback_events` (append-only) يوثّق كل إفراز/مصادرة بمن قرّره ومتى ومستنده.

نص إلزامي في الجدول والواجهة: «تتبّع تعاقدي لمبلغ محتجز لدى الطرف المتعاقد — ركيز ليست طرفًا حائزًا للمال».

### الدفتر المحاسبي غير القابل للتعديل (البند 6)

`ledger_entries` (رأس القيد: `entry_no`, `entity_id`, `project_id`, `posted_at`, `source_kind` (`execution` | `invoice` | `credit_note` | `holdback_event` | `manual`), `source_id`, `reverses_entry_id`) + `ledger_lines` (`account_code`, `debit`, `credit`, `memo`).

- تريغر `prevent_row_mutation` على الجدولين لكل `update` و`delete` — بلا استثناء ولا لـ `service_role`.
- تريغر توازن: مجموع المدين = مجموع الدائن، ورفض القيد غير المتوازن.
- التصحيح الوحيد: `reverse_ledger_entry(_entry_id, _reason)` تنشئ قيدًا جديدًا معكوس السطور يشير إلى الأصل عبر `reverses_entry_id`، ويُمنع عكس قيد سبق عكسه.
- القيود تُولَّد تلقائيًا من أحداث 16-أ (`financial_executions`) ومن إصدار المستندات، لا يدويًا افتراضيًا.
- `select` على `ledger_lines` خلف `finance.view` مثل بقية الأرقام.

### الواجهة

`/projects/$projectId/finance/documents`، `/projects/$projectId/finance/holdbacks`، `/entities/$entityId/ledger` (عرض قراءة فقط مع زر "قيد عكسي" لمن يملك `finance.approve`).

### بوابة قبول 16-ب

1. إصدار فاتورة بضريبة، ثم تصحيحها بنسخة جديدة → القديمة `superseded` ولا تُعدَّل.
2. إشعار دائن يشير للفاتورة الأصلية ويولّد قيدًا معاكسًا.
3. `update`/`delete` مباشر على `ledger_entries`/`ledger_lines` → مرفوض بالتريغر (يُختبر بـ SQL مباشر).
4. قيد غير متوازن → مرفوض.
5. `reverse_ledger_entry` تُنشئ قيدًا جديدًا ولا تلمس الأصل، ومحاولة عكس القيد العكسي مرتين → مرفوضة.
6. محتجز: إنشاء → إفراز جزئي → إفراز كامل، مع بقاء كل حدث في `holdback_events`، ورؤية المبلغ محجوبة عن المقاول بلا منح.

---

## خارج النطاق صراحةً

معالجة دفع فعلية، بوابات/مصارف، Escrow أو حيازة أموال، محرك ضرائب أو فوترة إلكترونية معتمدة، تعدد العملات وأسعار الصرف، تقارير مالية موحّدة على مستوى المنصة، وتصدير محاسبي لأنظمة خارجية.

## المخرجات عند التنفيذ

`supabase/migrations/*` (هجرتان: أ ثم ب)، `src/lib/finance.functions.ts`، شاشات المسارات أعلاه، وتحديث `.lovable/audit/00-requirements-traceability.md` و`00-database-security-inventory.md`.
