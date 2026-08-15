# المرحلة 25 — التكاملات الرسمية والخارجية (تجهيز نقاط الربط بلا ادعاء اتصال)

## 0) المبدأ الحاكم
لا نداء حقيقي لأي جهة حكومية، ولا scraping، ولا مفاتيح حقيقية. نبني **الهيكل الكامل** (سجل، adapter، سجل طلبات، idempotency، retries، مراقبة) بتنفيذ **mock فقط**، بحيث يصبح التحويل لاحقًا إلى sandbox/live تغييرًا في التنفيذ لا في المعمارية. القاعدة تخزّن **اسم متغير البيئة فقط** (مثل `NAFATH_CLIENT_SECRET`) ولا تخزّن قيمته أبدًا.

## 1) قاعدة البيانات (migration واحدة، بالبنية الإلزامية: CREATE → GRANT → RLS → POLICY → REVOKE)

### `integration_registry`
الأعمدة الدلالية: `code` (فريد، مثل `nafath`, `rega`, `real_estate_registry`, `municipality`, `electricity`, `water`)، `provider_name_ar/en`، `purpose`، `legal_basis`، `agreement_status` (`none/under_review/signed`)، `secret_env_names text[]` (أسماء فقط)، `exchanged_fields jsonb` (وصف الحقول المتبادلة)، `rate_limit_per_minute int`، `retry_policy jsonb` (`{max_attempts, backoff_seconds}`)، `webhook_url`، `idempotency_scope`، `status` (`planned/mock/sandbox/live` افتراضي `planned`)، `live_approval_ref text` (مرجع الموافقة الرسمية)، `failure_threshold int default 5`، `active bool`.

قيود صريحة:
- `integration_status_live_ck`: `status <> 'live' OR live_approval_ref IS NOT NULL` — ولأن منح `live_approval_ref` عمل رسمي لا برمجي، يضاف تريغر `private.reject_live_integration()` يرمي `INTEGRATION_LIVE_REQUIRES_APPROVAL` لأي محاولة تعيين `live` في هذه المرحلة (بلا استثناء من الواجهة).
- تريغر `private.reject_secret_values()`: يرفض أي عنصر في `secret_env_names` يخالف نمط اسم متغير بيئة (`^[A-Z][A-Z0-9_]{2,}$`) أو يشبه قيمة سرية (طول > 64، أو يحوي `-----BEGIN`, `sk_`, `eyJ`, مسافات) ⇒ خطأ `SECRET_VALUE_NOT_ALLOWED`. ونفس الحارس على `exchanged_fields` نصًا.

### `integration_requests`
`integration_id`, `direction` (`outbound/inbound`), `operation text`, `idempotency_key text NOT NULL`, `request_payload jsonb` (مُنقّى)، `response_payload jsonb`، `status` (`pending/success/failed/retried`)، `attempts int default 0`، `max_attempts int`، `safe_error text` (نص عربي/رمز خطأ فقط، يمر عبر `private.sanitize_error()` التي تحذف أي توكن يشبه سرًا)، `entity_id`, `project_id`, `created_by`, `first_attempt_at`, `last_attempt_at`, `completed_at`.
- فهرس فريد: `unique (integration_id, idempotency_key)` — حجر الأساس لعدم التكرار.

### `integration_failure_counters`
`integration_id` (فريد)، `window_started_at`، `failure_count`، `last_notified_at` — لمنع إغراق الإشعارات.

### نوع إشعار جديد
`integration.failure_threshold` بفئة `escalation` في `notification_types`، يُرسَل لموظفي المنصة عبر `private.emit_notification` القائمة.

### الوصول
- قراءة السجل والطلبات: **موظفو المنصة فقط** (`private.is_platform_staff(auth.uid())`) عبر RLS، مع فرع مطابق في `private.can` لوحدة جديدة `integrations` (الوحدة والفعل معًا — لا يرث أي دور مشروع منها شيئًا).
- الكتابة كلها عبر دوال SECURITY DEFINER؛ `revoke insert, update, delete, truncate` عن `anon, authenticated`، و`revoke select` عن `anon` للجدولين.

## 2) الدوال (SECURITY DEFINER، كلها تسحب EXECUTE من PUBLIC ثم تمنح صراحةً)
- `upsert_integration(...)` / `set_integration_status(code, status)` — الأخيرة ترفض `live`.
- `private.sanitize_error(text)` — يحذف أي جزء يشبه توكنًا/مفتاحًا قبل التخزين.
- `begin_integration_request(code, operation, idempotency_key, payload, ...)`:
  - إن وُجد صف بنفس (integration, idempotency_key) بحالة `success` ⇒ يعيد `{replayed: true, response}` بلا نداء جديد.
  - إن كان `failed` نهائيًا ⇒ يعيد الخطأ الآمن المخزّن.
  - وإلا ينشئ/يحدّث الصف بحالة `pending` ويزيد `attempts`، ويرفض تجاوز `max_attempts` بـ`INTEGRATION_MAX_ATTEMPTS_REACHED` مع تثبيت `failed`.
- `complete_integration_request(request_id, ok bool, response jsonb, error text)` — عند الفشل: يزيد العدّاد؛ إن بلغ `failure_threshold` ⇒ `emit_notification('integration.failure_threshold')` لكل موظف منصة نشط مرة واحدة لكل نافذة.
- `list_integrations()` / `list_integration_requests(code, limit)` — للمنصة فقط.
- `private.require_integrations_staff()` حارس مشترك.

## 3) طبقة Adapter/Mock في التطبيق
`src/lib/integrations/` :
- `types.ts` — واجهة موحّدة `IntegrationAdapter { code, operations, call(op, input, ctx): Promise<AdapterResult> }` و`AdapterResult = { ok, data?, errorCode?, isMock: true }`.
- `mock/*.ts` — منفّذ mock لكل جهة (`nafath`, `rega`, `registry`, `municipality`, `electricity`, `water`) يعيد بيانات موسومة صراحةً: كل استجابة تحمل `__mock: true` و`source: "mock"` وقيم مسبوقة بـ`MOCK-`.
- `registry.server.ts` — يختار المنفّذ بحسب `status`؛ لأي حالة غير `mock` يرمي `INTEGRATION_NOT_AVAILABLE` (لا يوجد منفّذ حقيقي في الشيفرة إطلاقًا).
- `src/lib/integrations.functions.ts` — `runIntegrationCall`, `listIntegrations`, `listIntegrationRequests`, `setIntegrationStatus` بغلاف `requireSupabaseAuth` وZod.
- **الفشل الآمن**: `runIntegrationCall` لا يرمي للأعلى في مسار عمل قائم؛ يعيد `{ status, safeMessageAr }` والعملية الأصلية تكمل. الرسائل العربية عبر i18n.

## 4) الواجهة — `/platform/integrations` (موظفو المنصة فقط)
تُضاف كتبويب رابع في `src/routes/_authenticated/platform.tsx` وملف `platform.integrations.tsx`:
- جدول التكاملات: الجهة، الغرض، الأساس النظامي، حالة الاتفاقية، **أسماء** متغيرات الأسرار (كشارات، بلا قيم)، rate limit، سياسة الإعادة، الحالة بشارة ملوّنة.
- تفصيل: آخر الطلبات (الحالة، المحاولات، مفتاح idempotency، الخطأ الآمن، التوقيتات) وعدّاد الفشل.
- زر «تشغيل نداء تجريبي (mock)» مع لافتة دائمة: «هذه بيانات تجريبية — لا يوجد اتصال فعلي بأي جهة».
- محاولة تحويل الحالة إلى `live` تعرض رسالة القيد العربية بدل النجاح.
- معيار ركيز كاملًا: skeleton بنفس التخطيط، `SoftEmpty`، حالة خطأ عربية بزر إعادة، بطاقات على الجوال، أرقام latn معزولة.

## 5) بوابة القبول الحية (`p25-*@example.com` حصرًا، وتبقى البيانات)
تُنشأ `p25-staff@example.com` (موظف منصة) و`p25-user@example.com` (مستخدم عادي) وكيان `p25` واحد. لا لمس لأي حساب دائم ولا `admin@rakeez.app`.
1. نداء mock عبر الأدابتر ⇒ صف في `integration_requests` بحالة `success` واستجابة موسومة `__mock: true` — يُعرض الصف الفعلي.
2. نفس المفتاح مرتين ⇒ `count(*) = 1` و`replayed: true` والاستجابة مطابقة.
3. عملية فشل متعمّدة ⇒ محاولات تتصاعد حتى `max_attempts` ثم `failed` نهائي، والعملية الأصلية (نداء من مسار قائم) تكتمل بنجاح.
4. تجاوز العتبة ⇒ صف إشعار فعلي `integration.failure_threshold` لموظف المنصة.
5. `set_integration_status(..., 'live')` ⇒ `INTEGRATION_LIVE_REQUIRES_APPROVAL`.
6. فحص نصي: استعلام يمسح كل الأعمدة النصية/JSON في الجدولين بحثًا عن أنماط أسرار (`sk_`, `eyJ`, `-----BEGIN`, سلاسل > 64 محرفًا) ⇒ صفر نتائج.
7. مصفوفة وصول: `p25-user` (غير موظف منصة) على `list_integrations`/الجداول ⇒ صفر صفوف/رفض.

## 6) التحصين (في نفس الهجرات، وناتجه يُرفق)
- `revoke` الكتابة عن `anon, authenticated` لكل جدول جديد، و`select` عن `anon`.
- سحب `EXECUTE` من `PUBLIC` لكل دالة جديدة في `public` و`private`، ثم منح صريح لـ`authenticated`/`service_role` حسب الحاجة.
- تشغيل استعلام فحص دوال السياسات على **`public` و`storage` معًا** (درس ذاكرة المشروع) وإرفاق ناتجه: يجب أن يكون صفرًا.
- فرع `private.can` الجديد يطابق **الوحدة والفعل معًا**.

## 7) خارج النطاق صراحةً (يوثَّق في الواجهة وADR)
أي اتصال حقيقي بنفاذ أو الهيئة أو البلديات أو شركات المرافق، أي دفع إلكتروني، وأي مزامنة تلقائية مجدولة. الحالة `live` مقفلة برمجيًا حتى وجود اتفاقية موقّعة ومرجع موافقة.
