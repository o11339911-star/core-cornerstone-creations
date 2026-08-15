# المرحلة 13 — الخدمات والمرافق والعدادات

## 1. الهدف
تفعيل `property_services` فعليًا كسجل دائم للخدمات والعدادات، بحيث يكون كل سجل ناتجًا **موثّقًا** عن طلب من نظام المرحلة 12 (`requests`) بعد مراجعة الموظف المختص — بدون نظام طلبات موازٍ، وبدون كتابة نتيجة دائمة قبل المراجعة.

## 2. ما هو موجود فعلًا (تم التحقق منه)
- `property_services`: `id`، `property_id` → `properties`، `service_type` (نص)، `status` (نص، له default)، `reference_no`، `notes`، توقيتات. لا وحدة، لا عداد، لا مصدر طلب، لا منطق.
- `property_units`: `id`، `property_id`، `unit_no`، `unit_type`، `status`…
- `requests`: يحتوي أصلًا على `property_id` و`property_unit_id` و`stage_id` و`thread_id` (1:1) و`request_no` و`status` و`assigned_entity_id/user_id` و`due_at` و`decided_*`.
- `request_types`: `code`، `name_ar/en`، `module` (app_module)، `requires_stage`، `requires_unit`، `is_active`، `order_index`.
- `request_status_transitions`: آلة الحالة كبيانات.
- `correspondence_message_attachments` موجود من المرحلة 12 ويُستخدم كما هو للمرفقات.

النتيجة: لا نحتاج جدول طلبات جديدًا. نحتاج (أ) أنواع خدمات كمرجع، (ب) حقول تفاصيل خاصة بطلب الخدمة، (ج) حالات الدورة، (د) سجل الخدمة الدائم بعد المراجعة.

## 3. التغييرات على قاعدة البيانات

### 3.1 مكتبة الخدمات — `service_catalog` (مرجعي)
`code` (PK)، `name_ar`، `name_en`، `category` (`electricity | water | sewage | telecom | gas | meter_ops`)، `is_metered` (هل ينتج عدادًا)، `allows_unit_level` (عداد مستقل للوحدة)، `default_provider_ar/en`، `is_active`، `order_index`.

الصفوف المزروعة:
`electricity_temp`، `electricity_permanent`، `water`، `sewage`، `telecom`، `gas` (اختياري/غير نشط افتراضيًا)، `meter_transfer`، `meter_split`، `meter_merge`، `unit_meter`.

### 3.2 أنواع الطلبات
لكل صف في `service_catalog` صفٌّ مقابل في `request_types` بالرمز `service_<code>` مع `module='properties'` و`requires_unit=true` لأنواع الوحدات (`unit_meter`, `meter_split`). التوسعة لاحقًا = صفوف لا migration بنيوية.

### 3.3 تفاصيل طلب الخدمة — `service_request_details`
جدول 1:1 مع `requests` (`request_id` PK/FK، UNIQUE):
- `service_code` → `service_catalog`
- `provider_name`، `external_ref_no` (رقم الطلب لدى الجهة)
- `requirements_note`، `payment_status` (`not_required | pending | paid`)، `payment_amount`، `payment_ref`، `paid_at`
- `appointment_at` (موعد المعاينة/التركيب)
- `meter_no`، `account_no`
- `installed_at`، `activated_at`
- توقيتات + `set_updated_at`

المرفقات: لا جدول جديد — تُرفع على رسائل سلسلة الطلب عبر `correspondence_message_attachments`.

### 3.4 حالات الدورة
تُضاف حالات الخدمة إلى قيد حالة `requests` وإلى `request_status_transitions`:
`draft → requirements` (تجهيز المتطلبات) `→ submitted` (تقديم) `→ in_review` (مراجعة) `→ info_needed` (يحتاج استكمالًا، ويعود إلى `in_review`) `→ awaiting_payment` `→ inspection_scheduled` (معاينة/تركيب) `→ installed` `→ activated` `→ closed`، مع `rejected` و`cancelled` كمخارج.
كل انتقال يبقى محكومًا بالـtrigger القائم ويُسجَّل في `permission_audit_log`.

### 3.5 تفعيل `property_services`
أعمدة تُضاف:
- `source_request_id` → `requests` (UNIQUE؛ طلب واحد = سجل خدمة واحد)
- `property_unit_id` → `property_units` (nullable)
- `service_code` → `service_catalog` (يحل محل `service_type` الحر؛ يُملأ `service_type` من الرمز للتوافق)
- `provider_name`، `meter_no`، `account_no`، `installed_at`، `activated_at`
- `reviewed_by`، `reviewed_at`

قيود منع التكرار:
- فهرس فريد جزئي على `meter_no` حيث `meter_no is not null` (على مستوى الجهة/الخدمة: `(service_code, meter_no)`) — رقم عداد مكرر مرفوض.
- فهرس فريد جزئي على `(property_id, service_code)` حيث `property_unit_id is null` — خدمة دائمة واحدة لكل عقار.
- فهرس فريد جزئي على `(property_unit_id, service_code)` حيث `property_unit_id is not null`.

trigger يمنع أي INSERT/UPDATE مباشر على `property_services` من غير دالة المراجعة (لا نتيجة دائمة قبل المراجعة).

## 4. الأمن
- `service_catalog`: قراءة للمصادَقين، كتابة `service_role` فقط.
- `service_request_details`: نفس منطق وصول الطلب — `private.can_access_request`.
- `property_services`: القراءة والكتابة عبر محرك صلاحية العقار نفسه من المرحلة 7 (`private.can(... 'properties', ...)` على `property_id`). الربط بعقار غير مصرح به يُرفض داخل الدالة قبل أي كتابة.
- GRANT صريح لكل جدول جديد؛ لا `anon`.

## 5. الدوال (RPC)
- `create_service_request(...)` → يستدعي منطق `create_request` القائم بنوع `service_<code>` ثم ينشئ `service_request_details`.
- `update_service_request_details(...)` → تحديث الجهة/الرقم الخارجي/السداد/الموعد/العداد قبل المراجعة فقط.
- `advance_service_request(_request_id, _to_status, _note)` → انتقال حالة عبر جدول الانتقالات + رسالة في السلسلة.
- `review_and_link_service(_request_id, _approve, _note)` → **نقطة التفعيل الوحيدة**: تتحقق من صلاحية العقار، ومن عدم تكرار رقم العداد، ثم تنشئ صف `property_services` بـ`source_request_id` و`reviewed_by/at`، وتنقل الطلب إلى `closed`. الرفض يعيد الطلب إلى `info_needed` بدون كتابة دائمة.
- `list_property_services(_property_id)` للعرض.

## 6. طبقة التطبيق والواجهة
- `src/lib/services.functions.ts`: `listServiceCatalog`, `listServiceRequests`, `getServiceRequest`, `createServiceRequest`, `updateServiceDetails`, `advanceServiceRequest`, `reviewAndLinkService`, `listPropertyServices`.
- مسارات:
  - `/_authenticated/projects/$projectId/services` — طلبات الخدمات مع فلترة بالحالة والنوع.
  - قسم «الخدمات والعدادات» داخل `/_authenticated/properties/$propertyId` — يعرض `property_services` المرتبطة مع رابط الطلب المصدر.
  - صفحة الطلب القائمة `/_authenticated/requests/$requestId` تُظهر لوحة تفاصيل الخدمة وشريط الإجراء التالي حسب الحالة، وزر «مراجعة وربط» للموظف المختص.
- مفاتيح i18n عربية/إنجليزية تحت `services.*`.

## 7. ترتيب التنفيذ
1. Migration: `service_catalog` + زرع الصفوف + صفوف `request_types`.
2. Migration: `service_request_details` + توسعة حالات `requests` وجدول الانتقالات.
3. Migration: تفعيل `property_services` (أعمدة + فهارس التكرار + trigger منع الكتابة المباشرة + RLS/GRANT).
4. Migration: الدوال الخمس أعلاه مع التدقيق في `permission_audit_log`.
5. طبقة التطبيق + i18n + المسارات.
6. Supabase Advisors ومعالجة أي Finding جديد.

## 8. اختبارات التحقق (بحسابات العرض الدائمة)
1. دورة كاملة لخدمة كهرباء دائمة حتى `activated` ثم مراجعة → ينشأ صف واحد في `property_services` بـ`source_request_id`.
2. محاولة إنشاء سجل خدمة برقم عداد مكرر → مرفوضة.
3. INSERT مباشر على `property_services` من مستخدم مصادَق → مرفوض (trigger).
4. مراجعة طلب يشير إلى عقار خارج صلاحية المراجع → مرفوضة.
5. رفض المراجعة → الطلب `info_needed` و`count(property_services)` بلا زيادة.
6. عداد مستقل لوحدة: طلب `unit_meter` بدون `property_unit_id` → مرفوض.
