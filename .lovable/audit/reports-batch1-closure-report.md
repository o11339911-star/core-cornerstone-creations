# الدفعة 1 من 4 — التقارير الهندسية: الصلاحيات والتعريب

## 1) نموذج التفويض (خادمي بالكامل)

- `entities.type` هو المصدر الوحيد للنوع الموحّد. لا اعتماد على اسم الكيان ولا على `user_metadata`.
- `private.is_engineering_entity(entity)` → مؤهل فقط: `design_office`, `supervision`, `inspector`.
  المطوّر العقاري (`developer`) وغيره غير مؤهل.
- `private.entity_linked_to_project(entity, project)` → الجهة مالكة المشروع أو طرف مقبول عليه.
- `private.engineering_report_block_reason(user, entity, project)` يعيد رمزًا تقنيًا أو NULL:
  `UNAUTHENTICATED` / `ENTITY_NOT_ENGINEERING` / `NOT_ENTITY_MEMBER` / `ENTITY_NOT_LINKED_TO_PROJECT`.
- `private.assert_can_issue_engineering_report` يرفع `ENGINEERING_REPORT_FORBIDDEN (<code>)` بخطأ 42501.

### نقاط الإنفاذ
| الطبقة | الموضع |
| --- | --- |
| RPC | `create_report`, `save_report_draft`, `submit_report_version`, `approve_report`, `create_report_version` |
| Trigger | `trg_reports_engineering_issuer` (INSERT على `reports`) |
| Trigger | `trg_report_versions_engineering_issuer` (INSERT/UPDATE على `report_versions`) |
| RLS/وصول | `private.can_access_report` (بلا تغيير في المنع، مع إضافة فتح لمقدّم الطلب) |

المحصّلة: حتى لو استُدعيت الـRPC مباشرة أو حُقنت كتابة بديلة، فالمشغّلات ترفض العملية.
التقارير الهندسية القديمة الصادرة عن جهة غير مؤهلة لم تُحذف؛ صارت للقراءة والمراجعة فقط
(كل محاولة تحرير/تقديم/اعتماد/إصدار جديد تُرفض).

## 2) نوع التقرير وطلب التقرير

- `reports.report_kind` و`report_templates.report_kind` بقيمتين: `engineering` / `administrative`
  (الافتراضي `engineering`، والتقارير الحالية اعتُبرت هندسية).
- التقارير الإدارية تبقى خاضعة لمحرك الصلاحيات القائم دون قيد نوع الكيان.
- `reports.request_id` يربط التقرير بطلبه؛ مُقدِّم الطلب يستطيع فتح التقرير للاطلاع فقط.
- نوع طلب جديد `engineering_report` («طلب تقرير هندسي»، وحدة `reports`).
- `public.list_project_engineering_offices(project)` — المكاتب الهندسية المقبولة على المشروع فقط.
- `public.request_engineering_report(...)` — ترفض أي هدف غير مؤهل أو غير مرتبط (`TARGET_OFFICE_NOT_ELIGIBLE`).

## 3) الصلاحيات (EXECUTE)

كل الدوال الجديدة: سحب `PUBLIC` و`anon`، ومنح `authenticated` فقط لما يُستدعى من التطبيق.
دوال `private.*` المستخدمة داخل تعبيرات/دوال يستدعيها المستخدم مُنحت `authenticated` صراحةً.
`enforce_engineering_report_issuer()` (دالة مشغّل) بلا EXECUTE لأي دور تطبيقي.

## 4) التعريب — لا مفتاح خام ولا رمز إنجليزي في الواجهة

ملف جديد `src/lib/reports/labels.ts`:
- `FIELD_LABEL_AR` يغطي مفاتيح الحقول التلقائية العشرين المعتمدة، وfallback «حقل غير معروف».
- `HEADING_LEVEL_LABEL`: عنوان رئيسي / عنوان فرعي / عنوان فرعي صغير (بدل H1/H2/H3).
- `REPORT_STATUS_LABEL` و`REPORT_KIND_LABEL` مع fallback «غير محدد» بدل الحالة الخام.
- `reportErrorMessage()` يحوّل كل خطأ خادمي إلى عربية واضحة ويحتفظ بالرمز التقني للسجل فقط:
  - `OFFICE_LICENSE_INVALID` → «رخصة الجهة غير سارية. حدّث الرخصة أو اختر جهة إصدار مؤهلة.»
  - `ENGINEERING_REPORT_FORBIDDEN (...)` → رسالة موجّهة لكل سبب.
  - `SELF_APPROVAL_FORBIDDEN`, `VERSION_LOCKED`, `OPEN_VERSION`, `NOT_DRAFT`, `NOT_SUBMITTED`, `FORBIDDEN`.

الملفات المعدّلة: `ReportEditor.tsx` (قائمة الحقول ومستويات العناوين)،
`projects.$projectId.reports.tsx` (بوابة الأهلية + لوحة طلب تقرير هندسي + تسميات عربية)،
`reports.$reportId.tsx` (رسائل الخطأ، بانر القراءة فقط، إخفاء أزرار الإصدار عند عدم الأهلية).

## 5) نتائج القبول

| الحالة | النتيجة |
| --- | --- |
| كيان مطوّر عقاري (شركة محمد للتطوير العقاري) — إنشاء/تحرير/تقديم/اعتماد/إصدار تقرير هندسي | PASS (ممنوع خادميًا عبر RPC + Trigger) |
| نفس الكيان عبر استدعاء RPC مباشر بتجاوز الواجهة | PASS (نفس المنع — الحارس داخل الدالة والمشغّل) |
| مكتب هندسي مرتبط ومخوّل | PASS (مسموح، مع بقاء فحص الرخصة والاعتماد المزدوج) |
| مكتب هندسي غير مرتبط بالمشروع | PASS (`ENTITY_NOT_LINKED_TO_PROJECT`) |
| مُقدِّم الطلب يفتح التقرير الناتج | PASS (`can_access_report` عبر `request_id`) |
| تقارير قديمة لجهة غير مؤهلة | PASS (محفوظة، للقراءة فقط) |
| لا raw English / snake_case / dot.keys في الواجهة العربية | PASS (`grep` لا يُظهر أي `FIELD_SOURCES` أو H1/H2/H3 في الواجهة) |
| typecheck / vitest / build | PASS (0 أخطاء، 6 اختبارات، بناء ناجح) |

ملاحظة تحقق: المشروع الاختباري للمطوّر لا يضم حاليًا أي مكتب هندسي مقبول،
فتظهر له لوحة الطلب مع حالة فارغة عربية توجّهه لإضافة مكتب هندسي ضمن أطراف المشروع.

لم يتم أي Publish/Deploy، ولم يُنشأ أو يُحذف أي حساب أو بيانات.
