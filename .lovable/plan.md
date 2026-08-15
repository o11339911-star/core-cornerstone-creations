# المرحلة 24 — السوق والخدمات والمتاجر المؤجلة (+ إصلاح /auth/forgot-password)

## 0) إصلاح عاجل مؤكَّد بالقراءة: مسار استعادة كلمة المرور
`src/routes/auth.tsx` مسار أب يطابق `/auth` **ومكوّنه يعرض نموذج الدخول ولا يعرض `<Outlet />`**. لذلك `/auth/forgot-password` و`/auth/reset-password` (وهما ابنان له في شجرة المسارات) يرسمان صفحة الدخول دائمًا. هذا هو السبب المؤكد، لا مشكلة في ملف صفحة الاستعادة نفسه.

الإصلاح:
- `src/routes/auth.tsx` يصبح تخطيطًا رقيقًا: يحتفظ بـ`ssr: false` و`validateSearch`، ويعرض `<Outlet />` فقط.
- ينتقل نموذج الدخول كما هو إلى `src/routes/auth.index.tsx` (المسار `/auth`)، مع قراءة `redirect` من `/auth` عبر `useSearch`.
- تحقق حي بالمتصفح: `/auth` نموذج دخول، `/auth/forgot-password` صفحة الاستعادة، `/auth/reset-password` صفحة إعادة التعيين، وصفر أخطاء console.

## 1) ذاكرة المشروع — الدرس الجديد
يُضاف إلى الذاكرة (Core): بعد أي سحب لمنح `PUBLIC` عن الدوال، يجب فحص دوال سياسات **`storage.objects`** أيضًا وليس سياسات `public` فقط، ومنح `EXECUTE` صراحةً لـ`authenticated` لكل دالة تُستدعى داخل سياسة تخزين. يُضاف استعلام الفحص الموسّع كجزء إلزامي من كل migration لاحقة.

## 2) مبدأ الفصل (حجر الأساس للمرحلة)
السوق فضاء منفصل تمامًا عن المشاريع. لا يوجد أي فرع في `private.can` يربط علاقة تجارية (إعلان، موعد، طلب، اشتراك) بأي وحدة مشروع. الوصول التجاري يُقاس بجداول السوق فقط، وسياساتها لا تستدعي `can_access_project` إطلاقًا. قيد صريح: أي فرع جديد يطابق **الوحدة والفعل معًا**، ووحدات السوق الجديدة (`marketplace`, `commerce`) لا تُمنح ضمنيًا لأي دور مشروع.

## 3) الوحدات والأدوار
- إضافة `marketplace` و`commerce` إلى `app_module`، وتعبئة `role_permissions` لهما (المالك/الأدمن كامل، المدير إنشاء/تحديث، العضو عرض، المشاهد عرض).
- فرعان جديدان في `private.can` مطابقان للوحدة والفعل، يعتمدان على عضوية الكيان النشط + سريان الترخيص + entitlement عند الاقتضاء.

## 4) الجداول (كلها `public`، مع GRANT ثم REVOKE في نفس الهجرة)
- `service_listings`: الكيان الناشر (= الحساب النشط وقت الإنشاء، يُثبته trigger من عضوية المُنشئ لا من المدخلات)، نوع الخدمة من `service_catalog`، عنوان، وصف، حالة (`draft/published/paused/archived`)، لغة، مدى سعري اختياري.
- `service_listing_areas`: مناطق التغطية (دولة/منطقة/مدينة) كصفوف مستقلة للفلترة.
- `appointments`: طرفان (كيان طالب/كيان مقدم + مستخدم منشئ)، نوع (`visit/consultation/meeting`)، `starts_at timestamptz` (UTC هو مصدر الحقيقة)، `duration_minutes`، `timezone_requester`/`timezone_provider` (IANA)، حالة (`proposed/confirmed/cancelled/completed/no_show`)، `cancel_deadline_at`، سبب الإلغاء.
- `appointment_participants`: من يظهر له الموعد، دوره، وقناة تذكيره.
- `feature_flags`: `code`, `enabled_globally bool default false`, وصف.
- `feature_flag_countries`: تفعيل لكل دولة معتمدة (`country_code`).
- `entitlements`: `code`, وصف، `is_commercial bool`، `blocked_for_core bool` (يمنع ربط الميزة بمسارات مجانية).
- `entity_entitlements`: الكيان، الكود، `granted_at`, `expires_at`, `revoked_at`.
- `entity_subscription_state`: خطة الكيان الحالية، `state` (`active/grace/read_only/archived`)، `grace_until`, `read_only_since`. لا فوترة ولا مبالغ.
- خلف الـflag (تُنشأ الآن، ومسدودة خادميًا حتى التفعيل): `stores`, `store_products`, `carts`, `cart_items`, `orders`, `order_items`, `order_payments` (طريقة: `cod` أو `bank_transfer` فقط + إيصال في دلو خاص `commerce-receipts`).

قيد صريح مطلوب في الوثيقة: جدول `core_free_actions` يسرد المسارات المجانية دائمًا (`invitation.accept`, `project.basic_view`)، ودالة/قيد يرفض أي محاولة ربطها بأي entitlement (خطأ `CORE_ACTION_CANNOT_BE_GATED`).

## 5) الدوال (SECURITY DEFINER، كل كتابة عبرها)
`publish_service_listing`, `update_service_listing`, `archive_service_listing`,
`propose_appointment`, `confirm_appointment`, `cancel_appointment` (تحترم `cancel_deadline_at` ⇒ `APPOINTMENT_CANCEL_WINDOW_PASSED`), `complete_appointment`,
`private.has_entitlement(entity_id, code)` + `private.require_entitlement(...)` (ترمي `ENTITLEMENT_REQUIRED`),
`private.commerce_enabled(country_code)` (ترمي `COMMERCE_DISABLED`), `create_cart`, `add_cart_item`, `place_order`, `attach_payment_receipt`, `confirm_order_payment`,
`simulate_subscription_expiry` (إداري/اختباري) يحوّل الكيان إلى `read_only` دون حذف أي صف، و`export_entity_data` (طلب تنزيل للمالك).

قواعد تفرضها القاعدة لا الواجهة:
- نشر إعلان باسم كيان لا يملك المستخدم فيه عضوية نشطة ⇒ `NOT_A_MEMBER_OF_ENTITY` (الهوية تُشتق خادميًا).
- كل دوال المتاجر تبدأ بفحص الـflag + الدولة قبل أي شيء آخر.
- كل ميزة تجارية تبدأ بـ`require_entitlement`.
- في حالة `read_only`: كل دوال الكتابة (السوق والمشاريع) ترفض بـ`ENTITY_READ_ONLY`، والقراءة والتنزيل يعملان، ولا حذف.

## 6) التذكيرات والمناطق الزمنية
التخزين UTC حصرًا، والعرض بمنطقة كل طرف عبر `Intl.DateTimeFormat` بالمنطقة المخزّنة له. التذكير عبر `duration_timers` (`subject_kind = 'appointment'`) و`emit_notification` القائمين — بلا مهام دورية جديدة. **الاتصال المرئي المدمج مؤجَّل صراحةً** ويوثَّق كذلك في الواجهة والـADR (لا زر ولا ادعاء تكامل).

## 7) الصلاحيات والتحصين (إلزامي في نفس الهجرات)
- `revoke insert, update, delete, truncate` عن `anon, authenticated` لكل جدول جديد، و`revoke select` عن `anon` عدا الإعلانات المنشورة إن لزم عرض عام (وحينها بأعمدة محددة فقط).
- سحب `EXECUTE` من `PUBLIC` لكل دالة جديدة في `public` و`private`، ثم منح صريح.
- تشغيل فحص دوال السياسات **على `public` و`storage` معًا** والتأكد من EXECUTE لـ`authenticated`.

## 8) الواجهات (معيار التصميم الدائم)
- `/marketplace` — تصفح الإعلانات وفلترة بالمنطقة ونوع الخدمة.
- `/marketplace/listings` (داخل الحساب) — إدارة إعلانات الكيان النشط، مع عرض هوية النشر ثابتة غير قابلة للتغيير.
- `/appointments` — قائمة المواعيد، اقتراح/تأكيد/إلغاء، عرض الوقت بمنطقة المستخدم مع ذكر منطقة الطرف الآخر.
- `/store` و`/orders` — تُعرضان فقط عند تفعيل الـflag، وإلا رسالة عربية واضحة «غير مفعّل في بلدك».
- شارة «قراءة فقط» على مستوى الحساب في حالة `read_only` + زر تنزيل البيانات.
- الكل بـ`dashboard-kit`، الهوية `#2B4A43` عبر التوكنات، i18n عربي/إنجليزي، RTL، الحالات الأربع، جوال أولًا، صفر hex وصفر نص إنجليزي مسرّب.

## 9) بوابة القبول الحية (حسابات وكيانات `p24-*@example.com` حصرًا، وتبقى بعد الاختبار)
1. نشر إعلان بهوية الحساب النشط ✔، ومحاولة النشر باسم كيان غير مملوك ⇒ رفض بنص الخطأ الفعلي.
2. موعد بين طرفين بمنطقتين مختلفتين (مثال `Asia/Riyadh` و`Europe/London`) ⇒ الوقت صحيح للطرفين، صف `duration_timers` مجدول، والإلغاء داخل المهلة ينجح وخارجها يُرفض.
3. مسار السلة/الطلب مع flag معطّل ⇒ رفض خادمي من الدالة (ليس إخفاء واجهة)؛ ثم تفعيل لدولة الاختبار ⇒ طلب بدفع عند الاستلام + طلب بتحويل بنكي مع إيصال مرفوع.
4. ميزة تجريبية مقفلة ⇒ `ENTITLEMENT_REQUIRED`؛ بعد المنح ⇒ نجاح؛ ومحاولة ربط `invitation.accept` بـentitlement ⇒ يرفضها القيد.
5. مصفوفة `private.can` الفعلية لبائع السوق على مشروع المشتري ⇒ صفر في كل خلية، وقراءة `projects/documents/financial_documents` ⇒ `[]`.
6. محاكاة انتهاء الاشتراك ⇒ الكتابة مرفوضة، القراءة والتنزيل يعملان، وعدّ صفوف الكيان قبل/بعد متطابق (لا حذف).

كل بند يُرفق بمخرجاته الفعلية من القاعدة، ولا يُمس أي حساب دائم ولا `admin@rakeez.app`.

## تفاصيل تقنية موجزة
هجرات مقسّمة: (أ) الوحدات والصلاحيات، (ب) جداول السوق والمواعيد، (ج) الـflags والـentitlements وحالة الاشتراك، (د) جداول المتاجر خلف الـflag، (هـ) الدوال والتحصين والفحص. ثم `src/lib/marketplace.functions.ts`, `appointments.functions.ts`, `commerce.functions.ts`, `entitlements.functions.ts` كأغلفة رقيقة فوق الـRPC عبر `requireSupabaseAuth`، ثم المسارات والترجمات، ثم بوابة القبول الحية.
