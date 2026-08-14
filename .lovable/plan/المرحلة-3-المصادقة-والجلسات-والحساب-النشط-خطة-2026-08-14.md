# المرحلة 3 — المصادقة والجلسات والحساب النشط (خطة)

> لا كود في هذه المرحلة. التنفيذ يبدأ فقط بعد اعتمادك وبعد اكتمال ربط Supabase من طرفك عبر تكامل Lovable القياسي.
> ملاحظة: الربط اليدوي بالمفاتيح غير مطلوب مني، ولن أنشئ أي Migration أو جدول قبل جهوزية الربط واعتماد المرحلة.

## 1. نموذج الهوية

- `auth.users` هو المصدر الوحيد للهوية (متسق مع ADR-0001). لا حساب مصادقة منفصل لكل كيان.
- مستخدم واحد ← ملف شخصي واحد ← عضويات متعددة في كيانات، لكل عضوية دور خاص بها.
- الدور لا يُخزَّن إطلاقًا في `profiles`.

## 2. مسارات المصادقة (Frontend)

| المسار | عام/محمي | الوظيفة |
|---|---|---|
| `/auth` | عام | تسجيل دخول بالبريد وكلمة المرور |
| `/auth/forgot-password` | عام | طلب رابط استرداد |
| `/auth/reset-password` | عام (توكن) | تعيين كلمة مرور جديدة |
| `/select-account` | محمي | اختيار الحساب النشط |
| `/_authenticated/*` | محمي | نطاق التطبيق بعد اختيار الحساب |
| `/settings/security` | محمي | تغيير كلمة المرور (يتطلب كلمة المرور الحالية) |

- لا صفحة تسجيل عام تمنح دورًا إداريًا أو وصولًا لكيان/مشروع/عهدة. إنشاء الحسابات وربطها بالكيانات عملية خادمية مدعوة (invite) فقط، تُبنى في مرحلة لاحقة.
- إن سُمح بإنشاء حساب شخصي مستقبلاً، فهو بلا أي عضوية كيان وبلا دور — شاشة "بانتظار دعوة".

## 3. الحساب النشط

- بعد الدخول: جلب الحساب الشخصي + العضويات ذات `status = 'active'` فقط، وباستثناء الكيانات الموقوفة/المنتهية (`entities.status = 'active'` و`membership.expires_at` فارغ أو مستقبلي).
- عضوية واحدة فقط ⇒ اختيار تلقائي مع إمكانية التبديل لاحقًا من الهيدر.
- الحساب النشط يُحفظ كمعرّف نطاق (`personal` أو `entity:<uuid>`) في مخزن العميل، **ويُعاد التحقق منه على الخادم في كل طلب محمي** — لا يُوثق بقيمة العميل أبدًا.
- عند التبديل: `queryClient.cancelQueries()` ← `queryClient.clear()` ← تحديث النطاق ← `router.invalidate()` ثم تحميل بيانات النطاق الجديد. لا يظهر أي صف من الحساب السابق.

## 4. Safe redirect

- `redirect` يُقرأ من query param ويُتحقق منه: يجب أن يبدأ بـ`/` ولا يبدأ بـ`//` أو `/\`، ولا يحتوي مخططًا (`http:`, `https:`, `javascript:`)، ويُطابق قائمة مسارات داخلية معروفة.
- أي قيمة غير مطابقة ⇒ التوجيه الافتراضي إلى `/select-account`.
- التنقل عبر `navigate` من TanStack Router فقط، لا `window.location`.

## 5. الجلسة والخروج

- استمرار الجلسة عبر تخزين Supabase الافتراضي مع تجديد تلقائي للتوكن؛ لا انتهاء قسري قصير.
- مستمع `onAuthStateChange` واحد في `__root.tsx`، مقتصر على `SIGNED_IN` / `SIGNED_OUT` / `USER_UPDATED`.
- زر خروج ظاهر دائمًا في الهيدر: `cancelQueries` ← `clear` ← `signOut` ← `navigate('/auth', { replace: true })` مع مسح الحساب النشط.
- الهيدر يعكس حالة الجلسة (اسم المستخدم + الحساب النشط بدل زر "دخول").

## 6. الجداول المقترحة (لن تُنشأ في هذه المرحلة)

**`public.profiles`** — `id uuid PK references auth.users(id) on delete cascade`, `full_name`, `avatar_url`, `locale`, `phone`, `created_at`, `updated_at`. يُنشأ تلقائيًا عبر trigger على `auth.users`.
- RLS: SELECT/UPDATE للمالك فقط (`auth.uid() = id`). لا INSERT/DELETE من العميل. لا وصول لـ`anon`.

**`public.entities`** — `id`, `name`, `type`, `status` (`active|suspended|closed`), `created_at`, `deleted_at`.
- RLS: SELECT للأعضاء فقط عبر `is_entity_member(auth.uid(), id)`. الكتابة للمالك/المسؤول فقط.

**`public.entity_memberships`** — `id`, `user_id`, `entity_id`, `role app_role`, `status` (`active|suspended|revoked`), `invited_by`, `expires_at`, `created_at`; قيد فريد `(user_id, entity_id)`؛ فهارس على `user_id` و`entity_id`.
- RLS: SELECT للمستخدم لعضوياته + لمسؤولي الكيان. الكتابة عبر خادم فقط (لا منح أدوار من العميل إطلاقًا).

**`public.app_role` enum**: `owner | admin | manager | member | viewer`.

**دوال `SECURITY DEFINER`**: `has_role(_user_id, _entity_id, _role)` و`is_entity_member(_user_id, _entity_id)` — تُستخدم داخل سياسات RLS لتفادي التكرار.

**GRANT إلزامي** في نفس الـMigration لكل جدول: `authenticated` بحسب السياسات، و`ALL` لـ`service_role`، بلا وصول `anon`.

## 7. التفاصيل التقنية

- كل قراءة/كتابة محمية عبر `createServerFn` مع `requireSupabaseAuth`؛ المسارات المحمية تحت `src/routes/_authenticated/` بالبوابة التي يديرها التكامل.
- ملفات `*.functions.ts` في `src/lib/` فقط، بلا استيراد admin client في نطاق الوحدة.
- كل نصوص الشاشات عبر نظام i18n (ar/en) الموجود من المرحلة 2، مع مكوّنات الحالات (loading/error/unauthorized).
- لا Edge Functions، لا مزود دخول اجتماعي في هذه المرحلة.

## 8. خارج النطاق

دعوات الأعضاء، إدارة الكيانات، التحقق بخطوتين، سجل التدقيق — مراحل لاحقة.

## اختبار القبول

- دخول ناجح ⇒ `/select-account` تعرض الحساب الشخصي والعضويات الفعالة فقط.
- `?redirect=https://evil.com` ⇒ يتجاهله ويوجّه داخليًا.
- التبديل بين حسابين ⇒ لا تسرب بيانات في الشبكة أو الواجهة.
- خروج ⇒ زر الرجوع لا يعيد أي شاشة محمية.
