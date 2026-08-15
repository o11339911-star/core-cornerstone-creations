# 27A — تقرير القدرات الفعلي (قراءة فقط)

تاريخ التنفيذ: 2026-08-15 · النطاق: تحقق وتوثيق فقط — بلا migration، بلا دوال، بلا حذف جلسات، بلا تفعيل MFA/CAPTCHA، بلا تدوير أسرار.

## 1) الإصدارات (دليل مباشر)

| العنصر | القيمة | المصدر |
|---|---|---|
| PostgreSQL | 17.6 | `select version()` |
| GoTrue (Auth) | v2.195.0 | `GET /auth/v1/health` |
| آخر مهاجرة Auth | 20260625000000 (77 مهاجرة) | `auth.schema_migrations` |
| `@supabase/supabase-js` | 2.112.3 | `node_modules` |
| الإضافات | `supabase_vault` 0.3.1 فقط؛ **لا** `pg_cron`، **لا** `pg_net`، **لا** `pgsodium` | `pg_extension` |

## 2) إعدادات Auth الفعلية (`GET /auth/v1/settings`)

```json
{"external":{"email":true, "phone":false, "anonymous_users":false, "google":false, ...كل مزود آخر false},
 "disable_signup":false, "mailer_autoconfirm":false, "phone_autoconfirm":false,
 "sms_provider":"twilio", "saml_enabled":false, "passkeys_enabled":false}
```

**النتائج:**
- مزود واحد فعّال: البريد/كلمة المرور. لا OAuth، لا هاتف، لا SAML، لا Passkeys، لا مستخدمين مجهولين.
- **`disable_signup = false`** ⇒ رغم أن التطبيق لا يعرض أي واجهة تسجيل ذاتي (`/auth` دخول فقط، والانضمام عبر الدعوة)، فإن نقطة `POST /auth/v1/signup` مفتوحة على مستوى الخدمة. **هذه أخطر نتيجة في 27A.** لم أختبرها عمليًا لأن الاختبار يعني إنشاء حساب حقيقي (ممنوع في 27A).
- `mailer_autoconfirm = false` ⇒ تأكيد البريد مطلوب، ما يخفّف الأثر لكنه لا يلغيه (بريد صالح واحد يكفي).

## 3) الجلسات والتوكن

| المؤشر | القيمة | ملاحظة |
|---|---|---|
| صفوف `auth.sessions` | 164 | — |
| جلسات لمستخدمين قائمين | **27** | — |
| جلسات يتيمة (مستخدمها محذوف) | **137** | مخلّفات حسابات الاختبار p22–p26 المُنظّفة |
| جلسات بـ `not_after` | 0 | لا انتهاء زمني إجباري مضبوط على مستوى الجلسة |
| جلسات `aal2` | 0 | لا جلسة واحدة بعامل ثانٍ |
| `auth.mfa_factors` | 0 | **MFA غير مستخدم إطلاقًا** |
| `auth.identities` | 64 (كلها email) | — |
| `auth.refresh_tokens` الملغاة | 2 | — |
| `auth.audit_log_entries` | 0 | لا سجل تدقيق Auth محفوظ |
| المستخدمون | 16 (كلهم `@rakeez.app` الدائمون) | لا حسابات اختبار متبقية |

**غير محسوم (لا يُقرأ من القاعدة ولا من الـAPI العام):** مدة صلاحية Access JWT، مدة/سقف الجلسة (`time-box`، `inactivity timeout`)، سقف عدد الجلسات لكل مستخدم، قيم Auth Rate Limits الفعلية، حالة CAPTCHA ومزوده، حالة النسخ الاحتياطي وPITR، وإعدادات SMTP المخصص. **كلها إعدادات لوحة Supabase.** التصحيح المُلزم من المالك مُطبَّق في هذا التقرير: **Supabase Auth يطبّق Rate Limits مدمجة افتراضيًا** (لكل نقطة نهاية: signup/signin/otp/recover/verify…) و**يدعم CAPTCHA** (hCaptcha/Turnstile) على الدخول والتسجيل واستعادة كلمة المرور؛ المطلوب قراءة قيمها الفعلية من اللوحة لا افتراض غيابها.

## 4) قاعدة البيانات والصلاحيات

- **RLS**: صفر جدول في `public` بلا RLS.
- دوال `public` بـ SECURITY DEFINER: 247 — **صفر منها بلا `search_path` مثبّت**.
- دوال `private`: 107، منها 93 SECURITY DEFINER — **صفر بلا `search_path` مثبّت**.
- **قابل للتنفيذ من `anon`** (8 دوال، كلها مقصودة ومراجَعة):
  `public.get_public_entity_profile`, `public.verify_marketing_package`, `public.verify_report`, `public.get_public_media`, `public.get_legal_document`, `public.list_legal_documents`, و`private.is_active_member`, `private.can` (الأخيرتان لازمتان لأن تعبيرات RLS تُنفَّذ بصلاحيات الدور المستعلم — قاعدة مثبتة في ذاكرة المشروع).
- `platform_staff` = 0 صفوف حاليًا (نُظّفت مع p26) ⇒ لا أحد يملك اليوم وصول لوحة المنصة.

## 5) الفحوصات الآلية

- **فحص الاعتماديات**: لا ثغرات عالية أو حرجة.
- **فحص أمان Supabase/Lovable**: 4 تنبيهات بمستوى `warn`، لا شيء حرج:
  1. `anon_security_definer_function_executable` — يطابق الدوال الثمانية أعلاه (عامة بالتصميم، مراجَعة).
  2. `authenticated_security_definer_function_executable` — نمط المنصة كله مبني على دوال محروسة؛ مقصود.
  3. **`auth_leaked_password_protection` معطّلة** — إصلاح بنقرة واحدة في اللوحة، بلا أي أثر على المستخدمين. توصية: تفعيلها في 27B.
  4. ملاحظة `service_listing_areas` — الفاحص نفسه يقرّ بأنها غير مطلوبة الإجراء.

## 6) النتائج غير المحسومة (تحتاج قراءة من لوحة Supabase — قرار/وصول المالك)

1. مدة Access JWT الحالية وسقف الجلسة والخمول.
2. سقف عدد الجلسات المتزامنة لكل مستخدم.
3. قيم Auth Rate Limits لكل نقطة نهاية.
4. حالة CAPTCHA ومزوده.
5. خطة النسخ الاحتياطي الحالية وتوفّر PITR.
6. SMTP: مدمج (محدود المعدل جدًا) أم مخصص — يؤثر مباشرة على مسارات الدعوة واستعادة كلمة المرور.
7. هل `disable_signup` يجب أن يصبح `true`؟ (توصيتي: نعم، فورًا — المنصة بالدعوة فقط.)
