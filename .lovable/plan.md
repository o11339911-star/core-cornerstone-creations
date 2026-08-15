# المرحلة 7 — الملف العقاري الموحد (خطة)

الهدف: بناء "ملف عقاري" مستقل عن المشروع، يجمع الصكوك والرخص والحدود والوحدات، مع إصدارات لا تُحذف، ونسبة اكتمال محسوبة ديناميكيًا.

## 1. نموذج البيانات

### properties (العقار)
- الملكية على نمط ADR-0001: `owner_id` (auth.users) + `entity_id` (nullable) — كما في `projects`.
- الحقول: `kind` (land / villa / building / compound / unit_block)، `name`، `code`، `status`، `city`، `district`، `land_area`، `plan_no`، `parcel_no`، `notes`.
- الموقع مفصول لعمودين بصلاحيات مختلفة (بند 3):
  - `approx_lat` / `approx_lng` — موقع تقريبي (عرض عام لأطراف المشروع).
  - `exact_lat` / `exact_lng` / `exact_address` — دقيق، لا يظهر إلا لمن يملك صلاحية عرضه.
- `created_by`, `created_at`, `updated_at`, `deleted_at` (soft delete).

### property_owners (الملاك ونسبهم)
- `property_id`, `owner_user_id` (nullable), `owner_entity_id` (nullable), `owner_name_text` (لمالك خارجي بلا حساب), `national_id_masked`, `share_percent numeric(6,3)`, `starts_on`, `ends_on`.
- منع تجاوز 100%: trigger `enforce_owner_share_total` يجمع النسب الفعّالة (`ends_on is null` وغير محذوفة) بعد كل insert/update ويرفض إذا تجاوز 100. مع `CHECK (share_percent > 0 AND share_percent <= 100)`.

### المستندات وإصداراتها
نمط موحّد: جدول رأس (هوية المستند) + جدول إصدارات (append-only).
- `deeds`: `property_id`, `deed_number`, `issuer`, `current_version_id`.
- `deed_versions`: `deed_id`, `version_no`, `deed_date`, `area`, `owner_name_snapshot`, `file_path` (Storage), `file_hash`, `source` (`manual` | `extracted`), `extracted_payload jsonb` (يُملأ لاحقًا يدويًا أو بتحليل — لا تحليل الآن)، `created_by`, `created_at`.
- `building_licenses`: `property_id`, `license_number`, `authority`, `current_version_id`.
- `license_versions`: `license_id`, `version_no`, `issued_on`, `expires_on`, `scope_text`, `file_path`, `source`, `extracted_payload`, `created_by`.
- قاعدة الإصدارات (بند 4): تريجر يمنع `UPDATE`/`DELETE` على جداول `*_versions` (append-only)، وأي استبدال = صف جديد بـ `version_no + 1` ثم تحديث `current_version_id` في الرأس فقط.

### land_boundaries
- `property_id`, `side` (north/south/east/west/other), `length_m`, `description`, `neighbor_text`, `order_index`.

### property_units
- `property_id`, `unit_no`, `unit_type` (apartment/floor/shop/villa)، `floor_no`, `area`, `rooms`, `status` (planned/available/sold/rented)، `notes`.

### property_services (هيكل فقط — التفعيل في المرحلة 13)
- `property_id`, `service_type` (electricity/water/sewage/telecom/gas)، `status` (`not_started` افتراضيًا)، `reference_no`, `notes`.
- بلا منطق تشغيل ولا واجهة تفاعلية الآن؛ عرض قراءة فقط.

### property_projects (جدول الربط — بند 2)
- `property_id`, `project_id`, `relation` (`primary` | `related`)، `linked_by`, `created_at`، فريد على (property_id, project_id).
- لا مفتاح صلب من `projects` إلى `properties`؛ العقار قد يخدم أكثر من مشروع والعكس.

## 2. الصلاحيات (امتداد المرحلتين 5 و6)
- إضافة قيمة `properties` إلى `app_module`، وتغذية `role_permissions` بها بنفس نمط `projects`.
- دالة `private.can_access_property(uid, property_id)`: مالك العقار، أو قيادة الكيان المالك، أو مستخدم لديه وصول لمشروع مرتبط بالعقار عبر `property_projects` (باستخدام `private.can_access_project` الحالية)، أو منحة صريحة في `permission_grants`.
- الموقع الدقيق: عرضه يتطلب `private.can(uid,'properties','view_exact')` — عمليًا عبر view `properties_public` يُظهر الأعمدة التقريبية دومًا ويُخفي الدقيقة (NULL) لغير المصرح لهم، بنفس نمط قناع الأسماء في المرحلة 6.
- RLS على كل الجداول + GRANT صريح لـ authenticated و service_role، وحذف = soft delete (لا سياسة DELETE).

## 3. نسبة الاكتمال (بند 5)
- دالة `public.property_completion(_property_id uuid) returns numeric` + view `property_completion_view`.
- الأوزان تعتمد على `properties.kind` عبر جدول مرجعي `property_completion_rules(kind, requirement_code, weight)`، ليتغير المطلوب بين أرض/فيلا/مبنى/مجمع دون تعديل كود.
- المتطلبات المُقاسة: بيانات أساسية، ملاك بمجموع 100%، صك بإصدار حالي، رخصة (حيث تلزم)، حدود الأرض الأربعة، وحدات (للمباني/المجمعات فقط).
- لا عمود ثابت يُحدَّث يدويًا.

## 4. الطبقة الخادمية
`src/lib/properties.functions.ts` (wrapper رفيع فقط، بنفس نمط `projects.functions.ts` و`team.functions.ts`):
- `listProperties`, `getPropertyProfile` (ملخص + اكتمال + عدّادات التبويبات)، `createProperty`, `updatePropertyBasics`.
- `upsertPropertyOwners` (يتحقق من 100% قبل الإرسال ويعتمد على التريجر كخط دفاع أخير).
- `addDeedVersion`, `addLicenseVersion` (إنشاء الرأس عند الحاجة + إصدار جديد).
- `setLandBoundaries`, `upsertUnits`, `linkPropertyToProject`, `unlinkPropertyFromProject`.
- التخزين: bucket خاص `property-documents` بمسار `{property_id}/{doc_type}/{version_id}`، رفع/تنزيل عبر signed URLs من دالة خادمية تتحقق من `can_access_property` — لا bucket عام.

## 5. الواجهة (بند 7)
- `/properties` — قائمة العقارات (RakeezDataTable) مع نسبة الاكتمال.
- `/properties/new` — إنشاء مختصر (نوع، اسم، مدينة/حي، مساحة).
- `/properties/$propertyId` — الملف العقاري:
  - أعلى الصفحة: بطاقة ملخص موحدة (النوع، الموقع التقريبي، المساحة، الملاك، حالة الصك/الرخصة، شريط نسبة الاكتمال، المشاريع المرتبطة).
  - أسفلها: Accordion تبويبات **مطوية افتراضيًا**: الملاك • الصك والإصدارات • الرخص والإصدارات • حدود الأرض • الوحدات • الخدمات (قراءة فقط) • المشاريع المرتبطة.
- مفاتيح i18n جديدة في `src/i18n/locales/ar.ts` و`en.ts` (ar المرجع).

## 6. خارج النطاق
- أي استخراج/تحليل ذكاء اصطناعي لبيانات الصك — الحقول موجودة (`extracted_payload`, `source`) لكن لا معالجة الآن.
- تفعيل منطق `property_services` (المرحلة 13).
- لا نشر، ولا لمس GitHub.

## 7. ترتيب التنفيذ
1. Migration واحدة: الجداول + GRANT + RLS + التريجرات + الدوال + قواعد الاكتمال + bucket التخزين وسياساته.
2. تحديث الأنواع، ثم `properties.functions.ts`.
3. مفاتيح i18n ثم صفحات الواجهة الثلاث.
4. اختبار حي: نسب ملكية > 100% مرفوضة، إصدار جديد لا يمس الأصل، إخفاء الموقع الدقيق لغير المصرح، عزل الوصول عبر الربط بمشروع، احتساب الاكتمال لنوعين مختلفين — ثم حذف بيانات الاختبار وتشغيل Supabase Advisors.
