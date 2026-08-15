# المرحلة 10 — العقود والملاحق والمراسلات (خطة)

## 0. إصلاح مسبق ضروري (من المرحلة 9)

أثناء الاختبار الحي للمرحلة 9 ظهر خطأ حقيقي مؤكد: سياسة عرض `project_stages` تستدعي
`private.stage_in_scope`، لكن هذه الدالة غير ممنوحة صلاحية التنفيذ للمستخدمين المسجّلين،
فيفشل أي استعلام للمراحل بالخطأ `permission denied for function stage_in_scope`.
أول بند في Migration هذه المرحلة: منح `execute` على `private.stage_in_scope` لدور
`authenticated` (نفس نمط بقية دوال `private` المستخدمة داخل السياسات).

## 1. المبدأ العام

- لا مفهوم "طرف" جديد: أطراف العقد تشير إلى `project_parties` (المرحلة 9) أو إلى كيان/مستخدم داخلي.
- لا محرك صلاحيات موازٍ: كل قرار وصول يمر عبر `private.can(...)` بوحدتي `contracts` و`correspondence` الموجودتين في `app_module`.
- لا ادّعاء توقيع إلكتروني موثّق نظاميًا: التسمية في القاعدة والواجهة هي **"اعتماد داخلي" / internal approval**، وليست "توقيع رسمي".
- كل شيء إضافة لا حذف: الإصدارات append-only، الإنهاء بتغيير حالة لا بحذف.

## 2. الجداول الجديدة

| الجدول | الغرض | ملاحظات أساسية |
|---|---|---|
| `contracts` | العقد الأب: مشروع، عقار اختياري، نوع، رقم، عملة، حالة (`draft/active/suspended/completed/terminated`)، إصدار حالي | لا يحمل قيمة مالية مباشرة — القيمة تعيش في الإصدار |
| `contract_versions` | نسخة العقد: رقم إصدار تلقائي، القيمة المالية، مدة، شروط، ملف، سبب الإصدار | append-only بعد الاعتماد |
| `contract_parties` | ربط العقد بطرف: إما `project_party_id` (طرف خارجي من المرحلة 9) أو `entity_id`/`user_id` داخلي + دور الطرف في العقد (`first_party/second_party/witness/consultant`) وحالة الاعتماد الداخلي |
| `contract_stages` | ربط العقد بمراحل المشروع الفعلية من `project_stages` | لا نصوص حرة لأسماء المراحل |
| `contract_extensions` | طلب تمديد: مقدَّم من طرف، تاريخ جديد مطلوب، سبب — **منفصل تمامًا** عن الموافقة (حقول قرار مستقلة: `decided_by`, `decision`, `decided_at`, `decision_note`) | الطلب لا يغيّر تاريخ العقد؛ الموافقة فقط تُنشئ إصدارًا جديدًا |
| `change_orders` | أمر تغيير: وصف، أثر على القيمة، أثر على المدة، حالة (`requested/under_review/approved/rejected/withdrawn`)، مرجع الإصدار الناتج |
| `correspondence_threads` | سلسلة مراسلات مرتبطة بمشروع (وعقد/مرحلة اختياريًا)، موضوع، حالة (`open/closed`) |
| `correspondence_messages` | رسالة داخل السلسلة: كاتبها، النص، مرفق اختياري، **`visibility`** |

### الرؤية على الرسائل (بند 2)

عمود `visibility` على كل رسالة بثلاث قيم صريحة:

- `shared` — تظهر لكل من يملك وصولًا للسلسلة.
- `party_limited` — تظهر لأطراف محددين فقط عبر جدول `correspondence_message_audience` (نفس نمط `assignment_visibility_audience` من المرحلة 6).
- `internal_note` — ملاحظة داخلية: تظهر فقط لأعضاء كيان صاحب السلسلة، ولا تظهر لمقدّم الطلب ولا لأي طرف خارجي مهما كانت صلاحياته على المشروع.

السياسات تنفّذ هذا في القاعدة، لا في الواجهة — أي استعلام مباشر من طرف خارجي يعيد صفوفًا أقل فعليًا.

### رؤية القيمة المالية (بند 3)

القيمة المالية لا تُخفى بالواجهة، بل بالبنية:

- `contract_versions` يحوي الحقول المالية، وسياسته تشترط `private.can(uid,'finance','view',entity,project)`.
- الحقول غير المالية (المدة، الشروط، المرفق، رقم الإصدار) تُقرأ عبر `contract_versions_public` — عرض `security_invoker` يُظهر الأعمدة المالية كـ `NULL` لمن لا يملك `finance/view`، مع علم `can_view_amounts`.
- النتيجة: مقاول يرى وجود عقد مكتب الإشراف ومدته إن كان ضمن نطاقه، ويرى `NULL` مكان القيمة — لا تسريب على مستوى الـAPI.

## 3. الوصول (تفصيل)

- `contracts`: قراءة إذا `private.can(uid,'contracts','view',entity,project)` **و** كان المستخدم ضمن نطاق المشروع (`private.can_access_project`) أو طرفًا في العقد نفسه.
- طرف خارجي (`accepted_party_entity`): يرى فقط العقود التي هو طرف فيها، ومراحلها ضمن `private.stage_in_scope` — لا يرى عقود الأطراف الأخرى.
- الكتابة/التعديل: `contracts/update` أو `contracts/create` حسب الفعل، عبر `private.can` فقط.
- دالة مساعدة واحدة جديدة: `private.can_access_contract(_user_id, _contract_id)` تجمع الشروط أعلاه وتُستخدم في سياسات الجداول التابعة (نفس نمط `can_access_property`). ستكون `SECURITY DEFINER` مع فحص صلاحية حقيقي داخلها، وممنوحة `execute` لـ`authenticated` لأنها تُستدعى من السياسات.

## 4. عدم تعديل النسخة المعتمدة (بند 6)

- تريجر `assign_contract_version` يرقّم الإصدار تلقائيًا (نمط `assign_deed_version`).
- تريجر `contract_versions_lock`: يرفض أي `UPDATE`/`DELETE` على صف `approved_at is not null` برسالة واضحة (نمط `prevent_row_mutation` من المرحلة 7). التعديل قبل الاعتماد مسموح؛ بعده الطريق الوحيد هو ملحق/إصدار جديد.
- تريجر `sync_contract_current_version` يحدّث `contracts.current_version_id` عند إدراج إصدار جديد.
- الموافقة على `contract_extensions` أو `change_orders` تُنشئ **إصدارًا جديدًا** يشير إلى مصدره (`source_extension_id` / `source_change_order_id`) ولا تلمس الإصدار السابق إطلاقًا.

## 5. الأثر التدقيقي (بند 4)

تريجرات على `contracts`, `contract_versions`, `contract_parties`, `contract_extensions`, `change_orders`
تكتب في `permission_audit_log` الموجود (`object_type` = `contract`, `contract_version`, `contract_party`, `contract_extension`, `change_order`).
تسمية حقول الاعتماد: `approved_by` / `approved_at` / `approval_note` — ولا تُستخدم كلمة "توقيع" في القاعدة ولا في نصوص الواجهة؛ نص الواجهة: «اعتماد داخلي — لا يُعد توقيعًا إلكترونيًا موثقًا».

## 6. الطبقة الخادمية والواجهة

- `src/lib/contracts.functions.ts`: قائمة العقود، ملف العقد، إنشاء عقد + إصدار أول، إضافة إصدار، إضافة/إزالة طرف، ربط مراحل، طلب تمديد، البتّ في التمديد، أمر تغيير والبتّ فيه، اعتماد داخلي.
- `src/lib/correspondence.functions.ts`: السلاسل، الرسائل، إنشاء رسالة مع مستوى رؤية وجمهور محدد.
- دوال RPC `SECURITY DEFINER` فقط حيث تلزم الذرّية: `approve_contract_version`, `decide_contract_extension`, `decide_change_order` — وكلها تبدأ بفحص `private.can` داخلي.
- الواجهة:
  - `projects.$projectId.contracts.tsx` — قائمة عقود المشروع.
  - `contracts.$contractId.tsx` — ملخص أعلى الصفحة (الحالة، الطرف، المدة، القيمة إن سُمح) + تبويبات مطوية: الإصدارات، الأطراف، المراحل، التمديدات، أوامر التغيير.
  - `projects.$projectId.correspondence.tsx` — السلاسل والرسائل مع وسم بصري واضح للملاحظة الداخلية.
- مفاتيح i18n جديدة (`contracts`, `correspondence`) في `ar.ts` و`en.ts`.

## 7. الترتيب التنفيذي (بعد اعتمادك)

1. Migration واحدة: منح `stage_in_scope` + الأنواع + الجداول + GRANT + RLS + السياسات + التريجرات + العرض + الدوال.
2. تحديث `src/lib/database.ts` والأنواع المولّدة.
3. الطبقة الخادمية (`contracts.functions.ts`, `correspondence.functions.ts`).
4. i18n ثم صفحات الواجهة.
5. اختبار حي ثم تنظيف كامل موثّق ثم Supabase Advisors.

## 8. الاختبارات الحية المخططة (تُنفَّذ بعد الاعتماد فقط)

1. `UPDATE` على إصدار معتمد → مرفوض؛ الملحق يُنشئ إصدارًا جديدًا والأصل سليم.
2. طلب تمديد لا يغيّر تاريخ العقد؛ الموافقة وحدها تُنشئ الإصدار الجديد؛ ولا يستطيع مقدّم الطلب البتّ في طلبه.
3. مستخدم بلا `finance/view` يقرأ العقد فيعود مبلغ `NULL` فعليًا (تحقق من القيمة الراجعة لا من الواجهة).
4. طرف خارجي لا يرى عقد طرف آخر، ولا يرى أي رسالة `internal_note`، ويرى `shared` ضمن نطاقه.
5. إنهاء الطرف (المرحلة 9) يقطع وصوله للعقد المستقبلي بينما تبقى إصداراته ورسائله السابقة مؤرشفة كما هي.
