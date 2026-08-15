# المرحلة 19 — البحث ولوحة المشروع الموحدة

## ما تم التحقق منه فعليًا قبل كتابة الخطة

- `public.projects` يحتوي: `code`, `name`, `status`, `city`, `district`, `land_area`, `start_date`, `expected_end_date`, `entity_id`, `owner_id`, `project_template_id`, `closed_at`, `archived_at`, `deleted_at` — فيه رقم المشروع والحي مباشرة.
- `public.properties` يحتوي `plan_no`, `parcel_no`, `district`, `city`, `code` — أي أن «القطعة والمخطط» موجودان فعليًا ولا يحتاجان جدولًا جديدًا.
- `public.deeds` يحتوي `deed_number` + `property_id`، ويرتبط بالمشروع عبر `public.property_projects (property_id, project_id, relation)`.
- `public.building_licenses` يحتوي `license_number`, `authority`, `current_version_id`؛ و`license_versions` فيه `issued_on/expires_on`.
- دوال الصلاحية القائمة: `private.can(user, module, action, entity_id, project_id)`، `private.can_access_project(user, project_id)`، `private.can_view_project_finance(user, project_id)`، `private.can_access_property`، `private.can_view_exact_location` — كلها SECURITY DEFINER وجاهزة لإعادة الاستخدام. **لن يُكتب أي منطق صلاحية موازٍ.**
- `public.property_completion(_property_id)` قائمة (اكتمال الملف العقاري) — تُستخدم كما هي داخل قسم الملكية، ولا تُخلط بنسبة اكتمال المشروع.
- مصادر نسبة اكتمال المشروع موجودة فعليًا: `project_stages(status, is_required, deleted_at)` و`project_closure_items(status, is_required, phase)` من المرحلة 18.
- لا يوجد حاليًا مسار صفحة مشروع موحدة: الموجود تبويبات منفصلة فقط (`projects.$projectId.stages/contracts/finance/...`)، والجذر `/_authenticated/dashboard` ما زال «قيد الإنشاء».

---

## 1) طبقة القراءة في القاعدة (تجميع فقط — بلا أي جدول جديد)

لا جدول بيانات جديد، ولا عمود مخزَّن للنسبة، ولا مادة مُخبّأة (no materialized view).

- `public.project_completion(_project_id uuid) returns jsonb` — `stable`, `security definer`, `search_path=public`.
  - أول سطر فيها: `if not private.can_access_project(auth.uid(), _project_id) then return null; end if;` — أي حساب بلا وصول يحصل على `null`، لا خطأ يكشف الوجود.
  - تحسبها لحظيًا من الواقع: نسبة المراحل المطلوبة المكتملة (`project_stages` غير المحذوفة، `is_required`) ونسبة بنود الإغلاق المُلبّاة/المُعفاة (`project_closure_items`)، ثم وزن مركّب واحد + التفصيل.
  - الإرجاع: `{ stages_total, stages_done, closure_total, closure_done, percent }`.
- `public.get_project_overview(_project_id uuid) returns jsonb` — `stable`, `security definer`.
  - بوابة الدخول: `private.can_access_project(auth.uid(), _project_id)` وإلا `null`.
  - تجمّع في استدعاء واحد: الأساسيات، الموقع (الإحداثيات التقريبية فقط ما لم تُرجع `private.can_view_exact_location` صحيحًا)، الملكية (`property_owners` بحصص، والهوية تبقى `national_id_masked`)، الصك والرخصة وآخر إصداراتهما، الأطراف (`project_parties` النشطة)، المشرفون (`project_assignments` عبر الرؤية القائمة)، عدّادات المستندات حسب الحالة، المراحل، الطلبات المفتوحة، الخدمات، والاكتمال.
  - **القسم المالي**: يُضاف مفتاح `finance` **فقط** إذا `private.can_view_project_finance(auth.uid(), _project_id)` صحيح. غير ذلك المفتاح غير موجود إطلاقًا في الـ JSON — لا `null` ولا صفر ولا إخفاء بالواجهة.
- `public.search_projects(_q text, _limit int default 20) returns table(...)` — `stable`, `security definer`.
  - تبحث في: `projects.code`, `projects.name`, `projects.district`, `properties.plan_no`, `properties.parcel_no`, `properties.district`, `deeds.deed_number`, `building_licenses.license_number` (عبر `property_projects`).
  - **إعادة الفلترة الإلزامية وقت الاستدعاء**: كل صف مرشّح يمر بـ `private.can_access_project(auth.uid(), project_id)` قبل الإرجاع — نفس مبدأ «الصلاحية وقت الفتح» من المرحلة 17. لا نتائج مسرّبة، ولا رسالة «ممنوع» تكشف وجود المشروع.
  - تستبعد `deleted_at is not null`، وتعيد سبب المطابقة (`match_field`) لعرضه في نتيجة البحث.
- الصلاحيات بعد المهاجرة (إلزامي في نفس الملف):
  `revoke all on function ... from public, anon;` ثم `grant execute on function ... to authenticated;` لكل دالة من الثلاث. ثم فحص `information_schema.role_table_grants` و`information_schema.routine_privileges` وسحب أي زائد فورًا، وإرفاق النتيجة في التقرير.

## 2) طبقة الخادم (app)

`src/lib/project-overview.functions.ts` جديد بثلاث دوال `createServerFn` مع `requireSupabaseAuth`:
- `searchProjects({ q })` → `rpc('search_projects')`.
- `getProjectOverview({ projectId })` → `rpc('get_project_overview')`؛ ترجع `null` ⇒ الواجهة تعرض «غير موجود» لا «ممنوع».
- `getProjectCompletion({ projectId })` لإعادة الحساب بعد أي تغيير حالة.

مخطط Zod للملخص يجعل `finance` حقلًا **اختياريًا** (`.optional()`) لا nullable — فغيابه هو الحالة الطبيعية لغير المخوّل.

## 3) الواجهة

- `src/routes/_authenticated/projects.$projectId.tsx` (جديد) — صفحة المشروع الموحدة: رأس ثابت (الاسم، الرقم، الحالة، شريط نسبة الاكتمال)، ثم بطاقات ملخص قابلة للطي (Accordion من مكتبة `rakeez` القائمة): الأساسيات، الموقع، الملكية، الصك والرخصة، الأطراف والمشرفون، المستندات، المراحل، الطلبات، الخدمات، والمالية (تُرسم فقط عند وجود مفتاح `finance`).
- أسفل الملخص شريط تبويبات يربط إلى الصفحات التفصيلية القائمة كما هي (مراحل/عقود/مالية/طلبات/خدمات/مستندات/زيارات/تقارير/إغلاق/ضمانات/مدد) — لا إعادة كتابة لأي منها.
- `src/routes/_authenticated/dashboard.tsx` — يستبدل نص «قيد الإنشاء» بلوحة فعلية: شريط بحث موحّد (رقم مشروع/حي/قطعة/مخطط/صك) مع نتائج فورية تنقل إلى صفحة المشروع، وقائمة مشاريعي الأخيرة، وعدّادات المهام المفتوحة من المصادر القائمة.
- كل النصوص تمر عبر `src/i18n` (ar/en) والألوان من التوكنات الدلالية فقط.

## 4) بوابة القبول الحية (حسابات `p19-*@example.com` وكيان ومشروع اختبار جديدان حصرًا)

1. البحث برقم المشروع/الحي/القطعة/المخطط/رقم الصك يعيد المشروع الصحيح لمن يملك الوصول.
2. مستخدم بلا `finance.view` يفتح الملخص ⇒ **مفتاح `finance` غير موجود في استجابة الخادم نفسها** (يُثبت بقراءة الاستجابة، لا بالنظر إلى الشاشة)، وبقية الأقسام تظهر.
3. نفس المشروع لمستخدم يملك `finance.view` ⇒ القسم المالي يظهر بقيمه.
4. تغيير حالة مرحلة حقيقية وبند إغلاق حقيقي ⇒ النسبة تتغيّر فعليًا في استدعاءين متتاليين.
5. البحث بمعرّف/رقم مشروع لا يملك المستخدم وصولًا إليه ⇒ صفر نتائج، وفتح الصفحة مباشرة ⇒ «غير موجود» لا خطأ صلاحية.
6. `role_table_grants` + `routine_privileges` بعد المهاجرة: لا شيء لـ`anon`/`PUBLIC` على أي كائن جديد.

لن يُمَس أي من الحسابات الخمسة عشر الدائمة ولا `admin@rakeez.app` ولا أي مشروع حقيقي.

## ملاحظات تقنية

- لا `SECURITY DEFINER` بلا بوابة: كل دالة من الثلاث تبدأ بفحص وصول المستخدم الحقيقي، والتجميع الداخلي فقط هو ما يتجاوز RLS لتفادي عشرات الاستعلامات المتقاطعة.
- لا تخزين للنسبة: تُحسب في كل استدعاء، فلا خروج عن التزامن.
- لا تكرار لمصدر: كل حقل في الملخص يُقرأ من جدوله الأصلي بلا نسخ.
