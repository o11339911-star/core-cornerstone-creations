# المرحلة 4 — إنشاء المشروع وقوالب الأنواع (خطة)

## 1. النطاق
- تعريف مخطط القوالب والمشاريع والمراحل (بدون تنفيذ migration في هذه المرحلة).
- Seed منطقي لقوالب المراحل لكل نوع مشروع.
- صفحة "إنشاء مشروع جديد" (نموذج واجهة فقط، بلا منطق مالي أو أطراف).

خارج النطاق: التسعير، الأطراف والعقود، المراسلات، المستندات، تحرير المراحل المخصصة.

## 2. الجداول المقترحة

### `project_templates` (بيانات مرجعية عامة)
- `code text unique` (villa, residential_building, compound, commercial, land_development, offplan_sales)
- `name_ar`, `name_en`, `description_ar`, `description_en`
- `is_active boolean`, `requires_license boolean` (بيع على الخارطة = true)
- `feature_flag text null`, `version int`, `created_at`, `updated_at`, `deleted_at`
- RLS: قراءة للمستخدمين المسجّلين على الصفوف النشطة فقط؛ لا كتابة من العميل (تُدار عبر migration/خادم).

### `stage_templates` (مراحل القالب)
- `project_template_id` FK، `order_index int`، `code text`
- `name_ar`, `name_en`, `description_ar`
- `kind text` — `core` | `optional` (مراحل ركيز الأساسية مقابل مكتبة اختيارية)
- `is_required boolean` (المراحل الأساسية اللازمة: لا تُحذف عند الإنشاء)
- `default_duration_days int null`, `created_at`, `updated_at`, `deleted_at`
- تفرد: `(project_template_id, code) where deleted_at is null`
- RLS: قراءة فقط للمسجّلين.

### `projects` (بيانات نطاق)
- `owner_id uuid not null default auth.uid()` → `auth.users`
- `entity_id uuid null` → `entities` (مشروع شخصي أو تابع لكيان)
- `project_template_id` FK، `name`, `code`, `status` (`draft|active|on_hold|completed|cancelled`)
- `city text`, `district text`, `land_area numeric null`, `start_date date null`, `expected_end_date date null`, `notes text null`
- `created_by`, `created_at`, `updated_at`, `deleted_at`
- **قيد المالك الواضح:** `CHECK (entity_id is not null OR owner_id is not null)` مع `owner_id` إلزامي دائمًا؛ عند وجود `entity_id` يجب أن يكون المُنشئ عضوًا نشطًا في الكيان (يُتحقق داخل سياسة INSERT).
- RLS (deny by default): مالك المشروع يرى/يعدّل مشروعه؛ أعضاء الكيان يرون مشاريع كيانهم عبر `private.is_entity_member`؛ التعديل/الحذف للمالك أو أدوار `owner/admin/manager` عبر `private.has_role`. الحذف = soft delete.

### `project_stages` (نسخة المراحل داخل المشروع)
- `project_id` FK، `stage_template_id null` (null = مرحلة مخصّصة مستقبلًا)
- `source text` — `core` | `library` | `custom` (حقل مستقبلي للمخصص؛ لا واجهة له الآن)
- `order_index`, `name_ar`, `name_en`, `status` (`pending|in_progress|done|skipped`)
- `is_required boolean`, `planned_start date null`, `planned_end date null`, `created_at`, `updated_at`, `deleted_at`
- RLS: مشتقّة من صلاحية المشروع الأب عبر دالة `private.can_access_project(uid, project_id)`.

### `stage_dependencies`
- `project_id`, `predecessor_stage_id`, `successor_stage_id`, `type` (`finish_to_start` مبدئيًا)
- تفرد على الزوج، ومنع الاعتماد الذاتي بـ CHECK
- RLS: نفس دالة صلاحية المشروع.

كل جدول: GRANT صريح لـ `authenticated` و`service_role`، تفعيل RLS، سياسات صريحة لكل عملية، فهارس على مفاتيح النطاق (`owner_id`, `entity_id`, `project_id`).

## 3. أنواع المشاريع وقوالب المراحل (Seed)
- **فيلا:** دراسة الجدوى والمتطلبات → التصميم المعماري → التصميم الإنشائي → التراخيص البلدية → التعاقد والتنفيذ → الأعمال الإنشائية → التشطيبات → التسليم والضمان.
- **عمارة سكنية:** ما سبق + دراسة السوق/التأجير + أنظمة MEP + السلامة والدفاع المدني + الفرز/الصكوك.
- **مجمع:** التخطيط العام والكتلي + البنية التحتية + التصاميم المكرّرة + إدارة المرافق المشتركة.
- **مشروع تجاري:** دراسة الجدوى التجارية + تصميم واجهات ومساحات مؤجّرة + اشتراطات تشغيلية + تجهيز المستأجرين.
- **تطوير أرض:** التحقق من الصك والاستخدام + المخطط الأولي + الاعتمادات البلدية + خدمات البنية التحتية + الإفراز.
- **بيع على الخارطة:** خلف `requires_license` + Feature Flag معطّل — يُدرج القالب في القاعدة كغير نشط ولا يظهر في نموذج الإنشاء.

تمييز المراحل: `kind='core'` + `is_required=true` للمراحل النظامية اللازمة (تراخيص، تسليم)، `kind='optional'` لمراحل المكتبة، و`source='custom'` محجوز لمرحلة لاحقة.

## 4. الواجهة
- مسار جديد `src/routes/_authenticated/projects.new.tsx`: اختيار نوع المشروع (بطاقات) → بيانات أساسية (اسم، مدينة/حي، مساحة، تواريخ، ملاحظات) → اختيار النطاق (شخصي أو أحد كياناتي من `entity_memberships`) → معاينة المراحل الافتراضية مع تمييز الأساسي/الاختياري وإمكانية إلغاء الاختياري فقط.
- نصوص عبر i18n (ar/en) ومكوّنات `src/components/rakeez/*` القائمة.
- الحفظ عبر server function واحدة `createProject` (معاملة: مشروع + نسخ المراحل) في `src/lib/projects.functions.ts` مع `requireSupabaseAuth`.
- القراءة الأولية للقوالب عبر loader/`useSuspenseQuery`، وتحديث head() للمسار.

## 5. الترتيب التنفيذي (بعد الموافقة)
1. Migration واحدة: الجداول + GRANT + RLS + دوال الصلاحية + Seed القوالب والمراحل.
2. `projects.functions.ts` (قراءة القوالب، إنشاء مشروع).
3. صفحة الإنشاء + مفاتيح i18n.
4. اختبار فعلي: إنشاء مشروع شخصي والتحقق من نسخ المراحل، ثم حذف بيانات الاختبار.
