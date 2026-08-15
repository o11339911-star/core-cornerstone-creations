# المرحلة 14 — مكتبة المستندات العامة والإصدارات

## 1. الهدف
مكتبة مستندات **عامة** موحّدة لما لا يندرج تحت الأنظمة المتخصصة القائمة (صكوك، رخص، إصدارات عقود، مرفقات مراحل، مرفقات مراسلات): تقارير، مخططات، شهادات، دراسات، محاضر… بنفس نمط «أصل + إصدارات append-only» من المرحلة 7، مع ربط مرن بأكثر من سياق ومستويات رؤية موسّعة.

لا استبدال ولا ترحيل للأنظمة المتخصصة. الحالي يبقى كما هو؛ المكتبة الجديدة تُضاف بجانبه ويمكن أن تشير إليه لاحقًا للعرض فقط.

## 2. ما هو موجود فعلًا (تم التحقق منه)
- `deeds/deed_versions` و`building_licenses/license_versions`: نمط أصل + إصدار مرقّم (`version_no`, `file_hash`, `file_path`, `source`, `created_by`) مع `current_version_id` على الأصل و trigger مزامنة.
- `stage_attachments`: `project_id`, `stage_id`, `visit_id`, `observation_id`, `file_path`, `file_hash`, `mime_type`, `kind` — مرفق مسطّح بلا إصدارات.
- `correspondence_message_attachments`: مرفقات الرسائل.
- `contract_versions`: إصدارات مقفلة بعد الاعتماد.
- التنزيل الحالي: `createSignedUrl(path, 60)` من bucket `stage-evidence` داخل دالة خادم محمية (`site-visits.functions.ts`).
- `visibility_level` enum موجود: `internal | limited | project_wide` (يفتقد مستوى «عام معتمد»).
- محرك الصلاحية `private.can(user, module, action, scope)` مع `app_module` يحوي `documents` أصلًا، و`app_action` يحوي `view/create/update/soft_delete/approve/export/share`.

## 3. قاعدة البيانات

### 3.1 التصنيفات — `document_categories` (مرجعي)
`code` (PK)، `name_ar/en`، `group_code` (`report | drawing | certificate | study | official | other`)، `allowed_mime` (text[])، `max_size_mb`، `is_active`، `order_index`.
صفوف مزروعة: `technical_report`, `soil_study`, `architectural_drawing`, `structural_drawing`, `as_built`, `safety_certificate`, `test_certificate`, `insurance_doc`, `official_letter`, `other`.

### 3.2 الأصل — `documents`
`id`، `owner_entity_id` → `entities`، `category_code` → `document_categories`، `title`، `description`، `visibility` (نوع جديد، §3.5)، `current_version_id`، `status` (`draft | active | superseded | archived`)، `is_deleted`/`deleted_at`/`deleted_by`/`delete_reason` (حذف مؤقت)، `created_by`، توقيتات.
الأصل لا يحمل ملفًا؛ الملف يعيش في الإصدار فقط.

### 3.3 الإصدارات — `document_versions` (append-only)
`id`، `document_id`، `version_no` (UNIQUE مع `document_id`)، `storage_bucket`، `storage_path`، `file_ext`، `mime_type`، `size_bytes`، `checksum_sha256`، `scan_status` (`pending | clean | rejected`)، `scan_note`، `supersede_reason` (سبب استبدال الإصدار السابق)، `source` (`upload | derived | external`)، `created_by`، `created_at`.
- trigger `assign_document_version` يرقّم تلقائيًا (نفس `assign_deed_version`).
- trigger `sync_document_current_version` يحدّث `current_version_id` ويضع الإصدار السابق كـ`superseded`.
- trigger `prevent_row_mutation` على UPDATE/DELETE للإصدارات — غير قابلة للتعديل إطلاقًا؛ التصحيح = إصدار جديد بسبب استبدال.

### 3.4 الربط المرن — `document_links`
`id`، `document_id`، `context_type` (`project | property | property_unit | stage | contract | request`)، `context_id` (uuid)، `relation` (نص حر مقيّد: `attachment | reference | deliverable`)، `linked_by`، `created_at`، UNIQUE(`document_id`, `context_type`, `context_id`).
مستند واحد = عدة سياقات، بلا نسخ الملف. صلاحية الوصول تُحسب كاتحاد للسياقات المرتبطة (§4).

### 3.5 مستويات الرؤية — نوع جديد `doc_visibility`
`entity_private` (كيان المالك فقط) · `requester_private` (المُنشئ + مُقدّم الطلب) · `party_limited` (أطراف محددة) · `project_wide` (كل أطراف المشروع) · `public_approved` (عام معتمد).
- `party_limited` يُفصَّل عبر `document_audience` (`document_id`, `audience_entity_id | audience_user_id`) — نفس نمط `assignment_visibility_audience`.
- `public_approved` لا يُضبط بالكتابة المباشرة: يتطلب `approve_document_public(_document_id, _note)` من صاحب صلاحية `approve` على وحدة `documents`، وتسجّل `approved_by/approved_at` على الأصل. الرجوع عنه ممكن عبر نفس الدالة بعلم `false`.
- `public_approved` **لا يعني** وصولًا مجهولًا: لا GRANT لـ`anon`. يعني «مرئي لكل مستخدمي المنصة المصادَقين المرتبطين بالسياق أو خارجه» — أي إسقاط قيد السياق فقط.

### 3.6 الحذف المؤقت والاستعادة
`soft_delete_document(_id, _reason)` و`restore_document(_id)`؛ RLS تخفي `is_deleted = true` عن الجميع عدا صاحب صلاحية `soft_delete` على نطاق المستند. لا حذف صلب من التطبيق. حذف الأصل لا يحذف ملفات Storage (الأثر يبقى للتدقيق).

### 3.7 مسارات Storage — بلا أسماء كاشفة
bucket `documents` (خاص) — يُنشأ عبر أداة إنشاء الـbucket لا عبر SQL.
المسار الحرفي: `documents/{owner_entity_id}/{document_id}/{version_id}.{ext}`
- لا اسم ملف أصلي، لا اسم عقار/مالك/مشروع، لا رقم صك. الاسم الأصلي يُخزَّن كبيانات في `document_versions.original_name_hint` فقط عند الحاجة للتنزيل، ولا يظهر في المسار.
- trigger تحقق يرفض أي `storage_path` لا يطابق هذا القالب.

## 4. الأمن
- RLS على كل الجداول الجديدة، GRANT لـ`authenticated` و`service_role` فقط — لا `anon` مطلقًا.
- دالة `private.can_access_document(_doc_id, _action)`:
  1. `is_deleted` → مرفوض إلا لصاحب `soft_delete`.
  2. `entity_private` → عضوية في `owner_entity_id`.
  3. `requester_private` → المُنشئ أو مُقدّم الطلب المرتبط.
  4. `party_limited` → صف في `document_audience` (مستخدم أو كيانه).
  5. `project_wide` → داخلي في أي مشروع مرتبط عبر `document_links` (يُعاد استخدام `private.is_project_insider`).
  6. `public_approved` → أي مستخدم مصادَق، بشرط `approved_at is not null`.
  وفوق كل ذلك: `private.can(auth.uid(), 'documents', _action, scope)` من محرك المرحلة 5.
- الربط بسياق غير مصرح به مرفوض داخل `link_document(...)` قبل أي كتابة (نفس منطق المرحلة 13 مع العقارات): لا ربط بمشروع/عقار لا يملك المستخدم عليه `view`+`update`.
- التنزيل: لا يُسلَّم `storage_path` للعميل أبدًا. دالة `get_document_download_url(_version_id)` تتحقق من `can_access_document(..., 'view')` ثم تُصدر signed URL قصير العمر (60 ثانية) من الخادم. `export` مطلوبة للتنزيل الكامل، `view` تكفي للمعاينة (URL معاينة منفصل بنفس المدة).
- سجل التدقيق: كل رفع/ربط/تغيير رؤية/اعتماد عام/حذف/استعادة/إصدار signed URL يُسجَّل في `permission_audit_log` (`object_type='documents'`) — يتطلب توسعة قيد `permission_audit_object_type_ck`.

## 5. فحص الملف قبل القبول
يتم على الخادم داخل `create_document_version` وطبقة الرفع:
- قائمة امتدادات محظورة صريحة: `exe, dll, bat, cmd, sh, ps1, js, jar, msi, scr, com, vbs, apk, app, iso, html, htm, svg` (SVG محظور لخطر XSS في المعاينة).
- قائمة مسموحة فقط: `pdf, png, jpg, jpeg, webp, dwg, dxf, docx, xlsx, pptx, txt, csv`.
- تطابق الامتداد مع `mime_type` المعلن، ومطابقته لـ`allowed_mime` الخاص بالتصنيف.
- `size_bytes` ≤ `max_size_mb` للتصنيف (افتراضي 25MB، المخططات 100MB).
- `checksum_sha256` إلزامي ويُحسب في المتصفح ويُعاد التحقق من طوله/شكله على الخادم؛ تكرار checksum داخل نفس المستند = رفض («نفس الملف مرفوع سلفًا»).
- `scan_status` يبدأ `pending`؛ المستند لا يصبح `active` قبل `clean`. لا يوجد ماسح فيروسات فعلي في هذه المرحلة — الحقل والبوابة يُنفَّذان الآن، والفحص الخارجي يُوصَل لاحقًا.

## 6. الدوال (RPC)
`create_document(_category_code, _title, _description, _visibility, _owner_entity_id)` ·
`add_document_version(_document_id, _bucket, _path, _mime, _ext, _size, _checksum, _supersede_reason, _source)` ·
`link_document(_document_id, _context_type, _context_id, _relation)` / `unlink_document(_link_id)` ·
`set_document_visibility(_document_id, _visibility, _audience jsonb)` ·
`approve_document_public(_document_id, _approve, _note)` ·
`soft_delete_document(_document_id, _reason)` / `restore_document(_document_id)` ·
`list_documents(_context_type, _context_id, _include_deleted)` — كلها `security definer` مع تحقق داخلي من `auth.uid()`.

## 7. طبقة التطبيق والواجهة
- `src/lib/documents.functions.ts`: `listDocumentCategories`, `listDocuments`, `getDocument`, `createDocument`, `addDocumentVersion`, `linkDocument`, `setDocumentVisibility`, `approveDocumentPublic`, `softDeleteDocument`, `restoreDocument`, `getDocumentSignedUrl`.
- مسارات:
  - `/_authenticated/documents` — المكتبة العامة: تصفية بالتصنيف والرؤية والسياق، بحث بالعنوان، مبدّل «إظهار المحذوف» لأصحاب الصلاحية.
  - `/_authenticated/documents/$documentId` — الأصل + شريط الإصدارات (append-only) مع سبب الاستبدال، لوحة الروابط، لوحة الرؤية والجمهور، أزرار المعاينة/التنزيل/الاعتماد العام/الحذف/الاستعادة.
  - قسم «المستندات» داخل صفحة المشروع وصفحة العقار وصفحة المرحلة — يعرض `document_links` للسياق مع زر ربط مستند قائم أو رفع جديد.
- المعاينة داخل modal لـPDF/الصور فقط عبر signed URL؛ بقية الأنواع تنزيل مباشر.
- مفاتيح i18n عربية/إنجليزية تحت `documents.*`.

## 8. ترتيب التنفيذ
1. إنشاء bucket `documents` (خاص) + سياسات `storage.objects`.
2. Migration: `document_categories` + الزرع، نوع `doc_visibility`.
3. Migration: `documents` + `document_versions` + `document_audience` + `document_links` + triggers الترقيم/المزامنة/منع التعديل/تحقق المسار + RLS + GRANT.
4. Migration: `private.can_access_document` + توسعة قيد `permission_audit_log` + دوال §6.
5. طبقة التطبيق: `documents.functions.ts` + i18n + المسارات + أقسام السياق.

## 9. الاختبارات (بحسابات مؤقتة `p14-*` فقط)
1. **T1 دورة كاملة**: إنشاء مستند → إصدار 1 → إصدار 2 بسبب استبدال → التحقق أن `current_version_id` يشير للأحدث وأن الأول أصبح `superseded` وغير قابل للتعديل.
2. **T2 الرؤية**: مستخدم من كيان آخر بلا رابط سياق لا يرى `entity_private`/`project_wide`؛ ويراه بعد إضافته إلى `document_audience` تحت `party_limited`.
3. **T3 العام المعتمد**: `public_approved` بلا `approved_at` غير مرئي؛ بعد `approve_document_public` يصبح مرئيًا لمصادَق خارج السياق، ولا يزال محجوبًا عن `anon`.
4. **T4 فحص الملف**: رفض `.exe`، رفض `.svg`، رفض MIME غير مطابق، رفض تجاوز الحجم، رفض checksum مكرر داخل نفس المستند.
5. **T5 الربط غير المصرح**: `link_document` بمشروع/عقار لا يملك المستخدم صلاحية عليه → رفض بدون كتابة أي صف.
6. **T6 الحذف والاستعادة والتنزيل**: بعد الحذف المؤقت يختفي من القوائم ويُرفض signed URL؛ بعد الاستعادة يعود؛ والتحقق أن المسار المخزّن يطابق قالب المعرّفات فقط بلا أي اسم كاشف.

بعد الاختبار: حذف بيانات ومستخدمي `p14-*` فقط، ثم Supabase Advisors ومراجعة كل دالة `security definer` جديدة. لا مساس بالحسابات الدائمة الخمسة عشر ولا `admin@rakeez.app`.
