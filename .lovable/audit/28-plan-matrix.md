# المرحلة 28-R — مصفوفة التنفيذ (Pass/Fail)

- معرّف الجولة: `08160355` (وجولة تمهيدية `08160353` نُظّفت بالكامل)
- البادئات المستخدمة: `p28r-*@example.com` و`TEST-28R-*`
- خط الأساس المحمي قبل الجولة: مستخدمون 16، كيانات 6، عضويات 16، `platform_staff` = 0، مخططات 0، مشاريع 5
- كل رفض موثّق بنص الخطأ الخادمي الفعلي (RLS / RPC / Storage)، ولم يُقبل «200 فارغ» وحده دليلًا في اختبارات الكتابة

## 28-A — الهوية والتسجيل

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| A1 | إنشاء 6 حسابات اصطناعية | نجاح | PASS | `users=6` معرّفات مسجلة في `tests/phase28r/registry.json` |
| A2 | تسجيل الدخول لكل الحسابات | جلسة صالحة | PASS | 6 جلسات (لم تُطبع أي توكنات) |
| A3 | إنشاء صف `profiles` تلقائيًا | صف واحد | PASS | `rows=1` |
| A4 | قراءة ملف مستخدم آخر | منع | PASS | `rows=0` بحكم RLS |

## 28-B — العضويات والأدوار

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| B1 | كيانان + 5 عضويات بأدوار مختلفة | تهيئة | PASS | ALPHA (developer) وBETA (design_office) |
| B2 | دعوة عضو بدور مالك | قبول | PASS | `create_entity_invitation` نجحت |
| B3 | دعوة عضو بدور مشاهد | رفض | PASS | `42501 Not allowed to invite members to this entity` |
| B4 | دعوة داخل ألفا من مالك بيتا | رفض | PASS | `42501 Not allowed to invite members to this entity` |

## 28-C — المشاريع والمراحل

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| C1 | إنشاء مشروع بدور مدير | قبول | PASS | مشروع مُنشأ داخل ألفا |
| C2 | منع المشاهد من إنشاء مشروع | رفض | **FAIL** | مسموح فعليًا — راجع `DEF-28R-01` |
| C3 | توليد مراحل من القالب | قبول | PASS | `stages=2` |
| C3b | بدء تنفيذ المرحلة | قبول | PASS | `updated=1` |
| C4 | رفع مرحلة بدور عضو | رفض مفسَّر | PASS | `42501 Not allowed to submit this stage` |
| C4b | رفع مرحلة بدور مدير | قبول | PASS | `submitted` |
| C5b | اعتماد المرحلة من رافعها | رفض (فصل واجبات) | PASS | `42501 The submitter cannot approve their own stage` |
| C6b | اعتماد المرحلة من المالك | قبول | PASS | `approved` |
| C8 | اعتماد مرحلة ألفا من مالك بيتا | رفض | PASS | `42501 Not allowed to approve this stage` |
| C7 | احتساب نسبة الإنجاز | قيمة رقمية | PASS | `{percent:0,...}` |

## 28-D — المستندات ومصفوفة الصلاحيات

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| D1 | إنشاء مستند خاص بالكيان | قبول | PASS | `create_document` نجحت |
| D2 | إضافة نسخة مستند (append-only) | قبول | PASS | `version_no=1` في مخزن `documents` |
| D3 | قراءة مستند ألفا من بيتا | منع | PASS | `PGRST116 … 0 rows` |
| D4 | قراءة المستندات بمفتاح anon | رفض | PASS | `401 / 42501 permission denied for table documents` |

### ناتج `private.can` الفعلي (كيان ألفا، مشروع الاختبار) — V/C/U/A

| الدور | projects | documents | finance | drawings | members |
|---|---|---|---|---|---|
| owner | VCUA | VCUA | VCUA | VCUA | VCUA |
| manager | VCUA | VCUA | VCUA | VCUA | VCUA |
| member | ---- | ---- | ---- | ---- | ---- |
| viewer | ---- | ---- | ---- | ---- | ---- |
| beta_owner | ---- | ---- | ---- | ---- | ---- |
| outsider | ---- | ---- | ---- | ---- | ---- |

## 28-E — الطلبات والمراسلة

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| E1 | إنشاء طلب رسمي | قبول | PASS | `create_request` نجحت |
| E2 | رسالة داخل مراسلة الطلب | قبول | PASS | `post_request_message` |
| E3 | كتابة من كيان آخر | رفض | PASS | `42501 Not allowed to post on this request` |

## 28-G — وحدة المخططات (CAD)

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| G1 | إنشاء سجل مخطط | قبول | PASS | `create_drawing` |
| G2 | تسجيل نسخة DWG | نسخة + مسار خاص | PASS | `version_no=1`، مسار داخل `cad-originals` |
| G3 | رفع نسخة بدور مشاهد | رفض | PASS | `42501 Not allowed to upload drawing versions` |
| G4 | رفع نسخة من كيان آخر | رفض | PASS | `42501 Not allowed to upload drawing versions` |
| G5 | رابط مباشر للملف بلا مصادقة | رفض | PASS | `HTTP 400 / NoSuchBucket` (المخزن خاص وغير مكشوف) |
| G6 | رابط مباشر من كيان آخر | رفض | PASS | `HTTP 400 / NoSuchKey` |
| G7 | تحويل الحالة إلى `under_review` | قبول | PASS | تم |
| G8 | اعتماد داخلي من رافع النسخة | رفض (فصل واجبات) | PASS | `42501 The reviewer cannot be the uploader of the current revision` |
| G9 | حالة APS | معطّل fail-closed | PASS | `{status:"disabled", provider:"aps"}` |

## 28-H — عزل الكيانات

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| H1 | قراءة مشروع ألفا (صف مفرد) من بيتا | رفض | PASS | `406 / PGRST116 … 0 rows` |
| H2 | قراءة سجل مخطط ألفا من بيتا | رفض | PASS | `406 / PGRST116 … 0 rows` |
| H3 | تعديل مشروع ألفا من بيتا | صفر صفوف متأثرة | PASS | `200` مع مصفوفة فارغة — RLS تحجب الصف قبل التحديث |
| H4 | حذف مشروع ألفا من مستخدم خارجي | رفض | PASS | `403 / 42501 permission denied for table projects` |
| H5 | قراءة بمفتاح anon | رفض | PASS | `401 / 42501 permission denied for table projects` |
| H6 | `project_completion` من كيان آخر | لا بيانات | PASS | `null` بلا أي كشف |

## 28-I — الجلسات والإبطال

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| I1 | قراءة صالحة قبل الإبطال | نجاح | PASS | `HTTP 200` |
| I2 | `logout?scope=global` | قبول | PASS | `HTTP 204` |
| I3 | تجديد الجلسة بالتوكن القديم | رفض | PASS | `400 refresh_token_not_found` |
| I4 | استخدام access token بعد الإبطال وقبل الحذف | توثيق | INFO | `200` — التوكن يظل صالحًا حتى انتهاء صلاحيته → `DEF-28R-02` |
| I5 | حذف المستخدم إداريًا | قبول | PASS | `HTTP 200` |
| I6 | قراءة بالتوكن القديم بعد الحذف | لا بيانات | PASS | `200 rows=0` |
| I7 | كتابة بالتوكن القديم بعد الحذف | رفض | PASS | `403 / 42501 new row violates row-level security policy for table "projects"` |

## 28-J — التنظيف والتحقق النهائي

| # | الاختبار | التوقع | النتيجة | الدليل |
|---|---|---|---|---|
| J1 | حذف كل بيانات `TEST-28R` | صفر بقايا | PASS | `residue_entities=0`، `residue_projects=0` |
| J2 | حذف حسابات `p28r-*` | صفر بقايا | PASS | `remaining p28r: 0` |
| J3 | استعادة خط الأساس | مطابقة | PASS | users 16، entities 6، memberships 16، staff 0، projects 5، drawings 0، documents 0، requests 0، storage objects 0 |
| J4 | سلامة الحقول الحساسة للحسابات الدائمة | بلا تغيير | PASS | 6 كيانات بأدوارها كما هي (owner/admin/manager/member) و16 عضوية دون تعديل |
