# الدفعة 16-ب — المستندات المالية والدفتر المحاسبي والضمان

## الإطار القانوني (نص إلزامي في الواجهة وفي `comment on table`)

ركيز **سجل تعاقدي ومحاسبي فقط**: لا تحتفظ بأموال، ولا تنفّذ تحويلات، ولا تقدّم خدمة مالية أو ضريبية مرخّصة. المستند المالي هنا **توثيق لما أصدره الطرف خارج المنصة**، والمحتجز/الضمان **تتبّع تعاقدي** لا Custody ولا Escrow، والدفتر **سجل داخلي** لا بديل عن الدفاتر النظامية للمنشأة. حقلا الضريبة مجرد **نسبة ومبلغ يُدخلهما المستخدم** — لا محرك ضريبي ولا احتساب زكوي/ضريبي ولا ربط بهيئة الزكاة والضريبة والجمارك.

## ما بُني فعليًا في 16-أ ويُعاد استخدامه كما هو (تم فحصه في الملفات لا افتراضه)

| الأصل | الاسم الفعلي |
|---|---|
| بوابة الأرقام | `private.can_view_project_finance(_user_id, _project_id)` = `private.can_access_project` **و** `private.can(_user,'finance','view',null,_project)` |
| منع التعديل | `public.prevent_row_mutation()` (تريغر `before update or delete`، يرمي `42501`، محجوب عن `public/anon/authenticated`) |
| سجل التدقيق | `private.log_finance_event(_object_type, _object_id, _action, _project_id, _new)` → `permission_audit_log` |
| فصل الواجبات | `private.require_two_actors(_project_id)` + `private.entity_active_member_count(_entity_id)` |
| أحداث التنفيذ | `public.financial_executions` (append-only) الناتجة عن `public.execute_disbursement` |
| الدفعات والطلبات | `public.payment_milestones` / `payment_milestone_amounts`، `public.disbursement_requests` / `disbursement_request_amounts` |
| نمط الإخفاء | جدول `*_amounts` منفصل، سياسة `select` تشترط `can_view_project_finance`؛ الجدول الرئيسي مرئي بلا أرقام |
| نمط الكتابة | `grant select` فقط لـ`authenticated` + `revoke insert/update/delete`؛ كل كتابة عبر دوال `security definer` |
| نمط الإصدارات | `report_versions` / `contract_versions`: رأس + إصدارات append-only + مؤشر `current_version_id` + `superseded_by` |

**قاعدة ملزمة للدفعة ب:** لا جدول جديد يحمل مبلغًا في صفّه الرئيسي. كل رقم في جدول `*_amounts` أو `*_lines` محمي بنفس الشرط.

---

## 1) المستندات المالية

**`financial_documents`** (رأس، بلا أرقام): `project_id`, `contract_id`, `milestone_id` (اختياري), `disbursement_request_id` (اختياري), `doc_type` ∈ `invoice | tax_invoice | credit_note | debit_note | receipt`, `direction` ∈ `issued | received`, `issuer_party_id`, `counterparty_party_id`, `doc_number` (رقم الطرف الخارجي), `issue_date`, `status` ∈ `draft | issued | superseded | cancelled`, `current_version_id`, `references_document_id` (إشعار دائن يشير للفاتورة الأصلية)، `cancel_reason`.
- `unique(project_id, doc_type, doc_number)` عند وجود الرقم.
- `credit_note`/`debit_note` **يجب** أن يحمل `references_document_id` لمستند `issued` في نفس المشروع (check + تحقق داخل الدالة).

**`financial_document_versions`** (append-only، بنمط `report_versions`): `document_id`, `version_no` (تسلسل تلقائي بتريغر بنمط `assign_deed_version`), `created_by/at`, `change_reason` (إلزامي من الإصدار ٢ فما فوق), `superseded_by` (يُملأ عند إصدار نسخة أحدث), `payload` jsonb للبنود الوصفية بلا مبالغ.

**`financial_document_amounts`** (المبالغ، محمية بـ`finance.view`): `version_id` (PK/FK)، `subtotal`, `tax_rate` numeric(5,2), `tax_amount`, `total`, `currency='SAR'`, `retention_amount` اختياري.
- تريغر توازن بسيط: `total = subtotal + tax_amount` (تسامح ±0.01) و`tax_amount ≈ subtotal * tax_rate/100` **كتحذير لا كقيد** — الرقم المُدخل هو المرجع، ويُذكر صراحة أن المنصة لا تحتسب الضريبة.
- `prevent_row_mutation` على `update/delete` (المبالغ تُجمَّد مع الإصدار).

**التصحيح:** لا `update` على أي إصدار. `revise_financial_document(_document_id, _payload, _amounts, _change_reason)` تنشئ إصدارًا جديدًا، تضبط `superseded_by` على السابق، وتحدّث `current_version_id`. الإصدار القديم يبقى مقروءًا بحالة `superseded`.

**دوال:** `create_financial_document`, `revise_financial_document`, `issue_financial_document` (draft → issued، يولّد قيد الدفتر)، `cancel_financial_document(_reason)` (يولّد قيدًا عكسيًا لا حذفًا)، `create_credit_note(_source_document_id, …)`.

## 2) الضمان / المحتجز / العربون — تتبّع تعاقدي بحت

**`retention_holds`**: `project_id`, `contract_id`, `milestone_id` (اختياري), `kind` ∈ `retention | advance | guarantee`, `holder_party_id`, `beneficiary_party_id`, `hold_start_date`, `expected_release_date`, `release_terms_ar/en` (نص الشرط التعاقدي), `status` ∈ `active | partially_released | released | forfeited | cancelled`.
- `comment on table`: "تتبّع تعاقدي لمبالغ متفق على حجزها بين الأطراف خارج المنصة. ركيز لا تحتفظ بهذه الأموال ولا تُعدّ وسيط ضمان."

**`retention_hold_amounts`** (محمي بـ`finance.view`): `held_amount`, `released_amount` (محسوب من الأحداث بتريغر)، `remaining_amount` مولّد، `currency`.

**`retention_events`** (append-only): `hold_id`, `event_type` ∈ `created | partial_release | full_release | forfeit | cancel`, `event_date`, `note`, `acted_by/at`, `document_id` (مستند مرتبط اختياري)، ومبلغ الحدث في **`retention_event_amounts`** المنفصل المحمي. تريغر `prevent_row_mutation` على الحدث ومبلغه.
- حارس: مجموع الإفراجات ≤ `held_amount`؛ آخر إفراج يجعل المجموع = المحجوز فيتحول `status` إلى `released` تلقائيًا (لا كتابة يدوية للحالة).
- دوال: `create_retention_hold`, `release_retention(_hold_id, _amount, _note)`, `forfeit_retention(_reason)`, `cancel_retention_hold(_reason)`.

## 3) الدفتر المحاسبي غير القابل للتعديل

**`ledger_entries`** (رأس القيد): `project_id`, `entry_date`, `source_type` ∈ `financial_execution | document_issue | document_cancel | retention_event | manual_adjustment`, `source_id`, `memo`, `created_by/at`, `reverses_entry_id` (للقيد العكسي), `reversed_by_entry_id`, `is_reversal` bool.

**`ledger_lines`**: `entry_id`, `line_no`, `account_code` (من `ledger_accounts` مرجعي ثابت مصغّر: مستحقات، ذمم، محتجز، ضريبة، مصروف مشروع، تسويات), `side` ∈ `debit | credit`, `amount`, `currency`, `party_id` اختياري.

**قواعد صارمة:**
- `prevent_row_mutation` على `update` **و**`delete` للجدولين — يرمي `42501` لأي كاتب بما فيه `service_role` وSQL المباشر (التريغر لا يستثني أحدًا).
- تريغر توازن `enforce_ledger_balance` مؤجَّل (`constraint trigger ... deferrable initially deferred`) على مستوى القيد: مجموع المدين = مجموع الدائن، وعدد الأسطر ≥ 2، وإلا يفشل الـcommit. قيد غير متوازن مرفوض دائمًا.
- `revoke insert/update/delete` عن `authenticated` و`anon`؛ الإدخال حصرًا عبر `private.post_ledger_entry(...)` الداخلية.
- **الأرقام محمية**: `ledger_lines` سياسة `select` تشترط `can_view_project_finance`؛ `ledger_entries` مرئية بلا مبالغ لمن يملك وصول المشروع (يرى وجود القيد لا قيمته).

**`reverse_ledger_entry(_entry_id, _reason)`**: تنشئ قيدًا جديدًا يعكس كل سطر (debit↔credit) بنفس المبالغ، `is_reversal=true`, `reverses_entry_id=_entry_id`، وتكتب `reversed_by_entry_id` على الأصل عبر مسار داخلي واحد مسموح (`unique(reverses_entry_id)` + فحص `reversed_by_entry_id is null` وإلا `exception`: "القيد عُكس مسبقًا"). لا تلمس أسطر الأصل ولا مبالغه إطلاقًا. عكس قيدٍ عكسي ممنوع.

**التوليد التلقائي:** تريغر `after insert` على `financial_executions` → قيد صرف؛ `issue_financial_document` → قيد إصدار (مع سطر ضريبة إن وُجد)؛ `cancel_financial_document` وإشعار دائن → `reverse_ledger_entry` على قيد الفاتورة الأصلية؛ أحداث `retention_events` → قيود المحتجز والإفراج.

## 4) طبقة التطبيق

- `src/lib/finance-ledger.functions.ts` جديد بنفس نمط `src/lib/finance.functions.ts`: قراءات مع `amounts_masked` عند غياب صف المبالغ، وكتابات عبر RPC فقط.
- توسعة `src/routes/_authenticated/projects.$projectId.finance.tsx` بثلاثة تبويبات: **المستندات** (إصدارات + شارة `superseded`)، **المحتجزات** (شريط تقدم إفراج + سجل أحداث)، **الدفتر** (قيود مع أسطر مدين/دائن، وشارة "قيد عكسي" وربط بالأصل). عند الحجب: `—` مع تلميح "لا تملك صلاحية عرض المبالغ".
- شارة + سطر تنويه قانوني ثابت أعلى كل تبويب مالي، وترجمات عربية/إنجليزية في `src/i18n/locales`.

## بوابة القبول (تُنفَّذ لاحقًا بحسابات `p16b-*` جديدة فقط، ولا تُلمس الحسابات الدائمة)

1. إصدار فاتورة بنسبة ومبلغ ضريبة → ظهور قيد متوازن في الدفتر.
2. تصحيحها بإصدار جديد → الإصدار القديم `superseded` وما زال مقروءًا، ولا `update` وقع على مبالغه.
3. إشعار دائن يشير للفاتورة الأصلية → توليد قيد معاكس مرتبط بقيد الفاتورة.
4. `update` و`delete` مباشرين على `ledger_entries` و`ledger_lines` عبر SQL المباشر وPostgREST → رفض `42501`.
5. محاولة قيد غير متوازن → فشل عند الـcommit.
6. `reverse_ledger_entry` تنشئ قيدًا جديدًا والأصل سليم بايتًا؛ تكرار العكس → `exception`.
7. دورة محتجز: إنشاء → إفراج جزئي → إفراج كامل مع تحول الحالة تلقائيًا، ورفض الإفراج الزائد.
8. حساب مقاول بلا `finance.view`: يرى المستند والمحتجز والقيد ولا يرى أي رقم (تحقق عبر PostgREST مباشرة لا عبر الواجهة).
