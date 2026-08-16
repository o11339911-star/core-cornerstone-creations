# تأكيد البريد الإلكتروني — ما نُفِّذ وما يحتاج ضبطًا يدويًا

## داخل التطبيق (مُنفَّذ)

- `src/lib/auth-origin.ts`: يحسب عنوان العودة. الإنتاج دائمًا
  `https://core-cornerstone-creations.lovable.app`، ولا يُسمح بعنوان تطوير إلا
  عند تشغيل الكود فعليًا على localhost أو نطاق المعاينة الخاص بالمشروع.
- التسجيل يمرّر `emailRedirectTo = <origin>/auth/callback` (لا lovable.dev).
- `src/routes/auth.callback.tsx`: يعالج `token_hash+type` و`code` وشكل
  الـimplicit hash، يمسح الرابط فورًا (`history.replaceState`) قبل أي عمل،
  ويعرض: جارٍ التحقق / تم التحقق / منتهي / غير صالح + إعادة إرسال.
- الوجهة بعد النجاح تمرّ عبر `sanitizeRedirect` (مسارات نسبية فقط — لا open redirect).
- إعادة الإرسال حقيقية عبر `supabase.auth.resend` مع تهدئة 60 ثانية ومعالجة 429.
- لا يمكن إكمال تسجيل الكيان قبل `email_confirmed_at`: تحقق خادمي داخل
  `completeRegistrationEntity` (يرمي `EMAIL_NOT_VERIFIED`) + حاجز واجهة في
  `AccountCompletionGate`.

## يحتاج ضبطًا يدويًا في لوحة Supabase (لا يمكن تعديله من داخل المشروع)

الحالة المرصودة فعليًا عند اختبار رابط تأكيد رسمي:
رابط `/auth/v1/verify` يعيد التوجيه إلى **`http://localhost:3000`** بغض النظر عن
`redirect_to` — أي أن Site URL خاطئ وقائمة Redirect URLs لا تسمح بعنوان الإنتاج.
هذا هو سبب خروج المستخدم من التطبيق عند الضغط على زر التأكيد.

Authentication → URL Configuration:

- **Site URL**: `https://core-cornerstone-creations.lovable.app`
- **Redirect URLs** (أضِف):
  - `https://core-cornerstone-creations.lovable.app/auth/callback`
  - `https://core-cornerstone-creations.lovable.app/auth/reset-password`
  - `http://localhost:8080/auth/callback` (تطوير فقط)
  - `https://id-preview--*.lovable.app/auth/callback` (معاينة، اختياري)

Authentication → Email Templates → Confirm signup (قالب عربي بلا مرسل مخصص —
يبقى المرسل الافتراضي حتى يُضاف SMTP/نطاق موثّق):

```html
<div dir="rtl" style="font-family:system-ui,Segoe UI,Arial;line-height:1.8">
  <h2>تأكيد البريد الإلكتروني — ركيز</h2>
  <p>مرحبًا، لإكمال إنشاء حسابك في منصة ركيز اضغط الزر التالي:</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#075F5A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
      تأكيد البريد الإلكتروني
    </a>
  </p>
  <p>الرابط صالح لفترة محدودة. إذا لم تطلب هذا الحساب فتجاهل الرسالة.</p>
</div>
```

بعد ضبط الإعدادات أعلاه يعمل المسار كاملًا دون أي تغيير في الكود.
