# تدقيق إغلاق: توحيد مسارات دعوة أطراف المشروع — 2026-08-17

## الثغرة وسببها الجذري
عند تنفيذ حارس الدعوة المشدَّد سابقًا كُتب المنطق داخل
`public.invite_project_party_identified` فقط، بينما بقيت الدالة القديمة
`public.invite_project_party(uuid, uuid, project_party_role, ...)` كما هي:
`SECURITY DEFINER` مع EXECUTE لـ`authenticated`، بلا أي من الفحوص
`STAGES_REQUIRED` / `PERMISSIONS_REQUIRED` / `STAGE_NOT_IN_PROJECT` /
`END_DATE_MUST_BE_FUTURE` / `PERMISSION_NOT_DELEGATABLE`، وكانت **تكتب
`permission_grants` و`project_party_permissions` مباشرة لحظة الإرسال** — أي منح
وصول فعلي قبل قبول الطرف. أي عميل موثّق كان يستطيع استدعاءها عبر REST وتجاوز
الحارس الجديد بالكامل. السبب الجذري: تعدد مسارات لنفس العملية دون منطق مشترك واحد.

## الإصلاح
1. `private.invite_project_party_core(...)` = المنطق والحارس الموحّد الوحيد:
   auth.uid، ملكية/إدارة المشروع، مراحل غير فارغة ومن المشروع نفسه، صلاحية فعّالة
   واحدة على الأقل (تُتجاهل عناصر `enabled=false` ويُرفض الطلب إن لم يبقَ شيء)،
   قابلية التفويض لكل صلاحية، `ends_on` إلزامي > اليوم بتوقيت Asia/Riyadh،
   رفض الأرقام غير ASCII، منع دعوة الكيان المالك، منع التكرار، مرجع `INV-XXXX-XXXX-XXXX`
   عشوائي يولّد خادميًا، **حفظ snapshot فقط بلا أي منح فعلي**، وقيد سجل تدقيق.
   EXECUTE مسحوب من `public, anon, authenticated`.
2. `public.invite_project_party` (التوقيع القديم للكيانات المسجّلة) صارت wrapper
   رفيعًا فوق core — لم تُكسر الاستخدامات المشروعة ولم تعد تكتب أي منح.
3. `public.invite_project_party_identified` wrapper فوق core كذلك (يفرض بصمة معرّف).
4. المنح تُطبَّق حصريًا في `public.respond_to_project_party` عند القبول.
5. أُصلح عطلان مكتشفان أثناء الفحص:
   - سجل التدقيق كان يكتب أعمدة غير موجودة (`actor_id/entity_id/project_id/details`)
     فتفشل العملية كاملة → صُحّح إلى `actor_user_id/target_entity_id/target_project_id/new_value`.
   - القبول كان يفشل بـ`granted_by must be the acting user` ثم
     `Not allowed to manage permissions in this scope` → صار المنح باسم المستخدم
     القابل للدعوة، مع مسار مقيّد في `public.validate_permission_grant` يسمح فقط
     بمنح **مطابق حرفيًا** لعنصر داخل `permissions_snapshot` لدعوة `accepted`
     ردّ عليها نفس المستخدم وبنفس المشروع والجهة. أي منح آخر يبقى خاضعًا للفحص الكامل.

## نتائج الاختبارات الفعلية (كلها داخل transaction أُلغيت — صفر بيانات جديدة)
المسار القديم `invite_project_party`:
- بلا مراحل = `STAGES_REQUIRED` ✔ | بلا صلاحيات = `PERMISSIONS_REQUIRED` ✔
- كل الصلاحيات false = `PERMISSIONS_REQUIRED` ✔
- مرحلة من مشروع آخر = `STAGE_NOT_IN_PROJECT` ✔
- تاريخ اليوم = `END_DATE_MUST_BE_FUTURE` ✔
- دعوة صحيحة = نجحت، `project_party_permissions` = 0 قبل القبول، مرجع مثل `INV-9027-5740-2549` ✔

المسار بالمعرّف `invite_project_party_identified`:
- بلا مراحل / مرحلة مشروع آخر / أرقام عربية / تاريخ اليوم = مرفوضة بنفس الرموز ✔
- دعوة صحيحة = نجحت مع pending grants = 0 ✔

دورة الحياة:
- القبول أنشأ الصلاحيات المحددة فقط: `projects/view` (العنصر `enabled=false` لم يُمنح) ✔
- الرفض = 0 صلاحيات ✔
- محاولة منح إضافي خارج الـsnapshot من الطرف المدعو = `Not allowed to manage permissions in this scope` ✔
- سجلات التدقيق للإنشاء والرد مكتوبة ✔

الصلاحيات:
- `anon`: `invite_project_party=false`, `invite_project_party_identified=false` ✔
- `private.invite_project_party_core` لـ`authenticated` = false ✔
- الكتابة المباشرة على `project_parties` / `project_party_permissions` تبقى محكومة بالسياسات ✔

الكود: `inviteProjectParty` (server fn) صار يفرض `stageIds ≥ 1` و`permissions ≥ 1`
و`endsOn` إلزاميًا برسائل عربية. `tsgo --noEmit` نظيف.

لا نشر، ولا حذف بيانات، ولا تعديل حسابات.
