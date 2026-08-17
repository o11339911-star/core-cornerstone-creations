# تدقيق: إغلاق تجاوز دعوة طرف خارجي — 2026-08-17

## السبب الجذري
كان `public.invite_project_party_identified` يقبل `stage_ids` فارغة و`permissions` فارغة و`ends_on = null`،
ويمنح `permission_grants` فورًا عند الدعوة للكيان المطابق قبل قبول الطرف. والواجهة كانت ترسل مباشرة دون تأكيد،
ولم يكن هناك مرجع دعوة ولا رفض للأرقام العربية/الفارسية.

## ما نُفِّذ (قاعدة البيانات)
- `project_parties.party_reference` نمط `INV-XXXX-XXXX-XXXX` عشوائي UNIQUE يُولَّد خادميًا عبر
  `private.gen_party_reference()` وتُثبّته trigger `trg_project_party_reference` (غير قابل للتغيير عند UPDATE).
- `project_parties.permissions_snapshot jsonb` — لقطة الصلاحيات وقت الدعوة.
- `private.has_non_ascii_digits(text)` لرفض U+0660–U+0669 وU+06F0–U+06F9.
- `invite_project_party_identified` يرفض: مراحل فارغة، صلاحيات فارغة/ناقصة الحقول، مرحلة من مشروع آخر،
  تاريخ نهاية فارغ أو ≤ اليوم بتوقيت الرياض، أرقام غير ASCII، صلاحية لا يملكها المرسل
  (`PERMISSION_NOT_DELEGATABLE` عبر `private.can`)، الجهة المالكة كطرف، الطرف المكرر.
- لا مِنح صلاحيات عند الدعوة إطلاقًا؛ `respond_to_project_party` يطبّق snapshot عند القبول فقط ويسجّل audit
  للإنشاء والاستجابة مع المرجع.
- EXECUTE مسحوب من `public`/`anon` وممنوح لـ`authenticated` فقط (ودوال `private` للمحرك فقط).

## ما نُفِّذ (الواجهة والخادم التطبيقي)
- `src/lib/identity-format.ts`: `containsNonAsciiDigits`، `riyadhToday/riyadhTomorrow`، `isRealCalendarDate`.
- `src/lib/project-parties.functions.ts`: Zod يفرض `stageIds.min(1)`، `permissions.min(1)`، `endsOn` إلزامي،
  وفحص ASCII/تاريخ مستقبلي قبل الاستدعاء، وخرائط أخطاء عربية مفهومة (لا JSON خام).
- `projects.$projectId.parties.tsx`: تحقق عميلي مطابق، `min=غدًا` على حقل التاريخ، نافذة تأكيد
  (ResponsiveModal) بملخص: الطرف ونوعه ومعرّفه مقنّعًا (آخر 4)، الدور، تاريخ الانتهاء، أسماء المراحل،
  الصلاحيات مجمّعة حسب الوحدة، نطاق العمل. زر الإرسال معطّل أثناء التنفيذ وأثناء فتح النافذة (لا double submit،
  ولا تجاوز بـEnter لأن submit يفتح التأكيد فقط). عرض `party_reference` في بطاقة الطرف.
- الترجمات في `ar.ts` و`en.ts`.

## نتائج الاختبار (منفّذة فعليًا على القاعدة بسياق المالك)
- بلا مراحل → `STAGES_REQUIRED` ✔
- بلا صلاحيات → `PERMISSIONS_REQUIRED` ✔
- تاريخ اليوم → `END_DATE_MUST_BE_FUTURE` ✔
- مرحلة من مشروع آخر → `STAGE_NOT_IN_PROJECT` ✔
- أرقام عربية `٧٠٠٠٠٠٠٠٠١` → `NON_ASCII_DIGITS` ✔
- كاشف الأرقام: عربي=true، فارسي=true، ASCII=false ✔
- المراجع: 0 مخالفة للنمط، جميعها فريدة ✔
- `tsgo --noEmit`: بلا أخطاء ✔
- `anon` لا يملك EXECUTE على الدوال الجديدة ✔

لم يُنشر ولم تُعدّل أي حسابات. تحذيرات Supabase Linter المتبقية سابقة لهذه الدفعة وخارج نطاقها.
