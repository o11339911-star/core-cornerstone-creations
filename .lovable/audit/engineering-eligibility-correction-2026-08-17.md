# تصحيح أهلية التقرير الهندسي — 2026-08-17

## القاعدة المعتمدة
- `report_kind='engineering'` يقتصر على:
  - كيان من نوع `design_office`، أو
  - كيان `supervision` **فقط** إذا سُجّل له نشاط اقتصادي هندسي فعلي في النموذج الموحّد (`entity_activities.activity_code LIKE '7110%'` — الأنشطة المعمارية والهندسية والاستشارات الفنية، ISIC4).
- `inspector`/المختبرات لم تعد تُعامَل تلقائيًا كمكاتب هندسية.
- أنواع مستقلة جديدة: `inspection` (تقرير فحص) و`technical_test` (تقرير اختبار فني)، متاحة فقط لجهة فحص/مختبر: نوع `inspector` أو نشاط `7120%`، وعضوية الحساب فيها وارتباطها المقبول بالمشروع.

## قاعدة البيانات (migration واحدة)
- `private.is_engineering_entity` أُعيدت كتابتها وفق القاعدة أعلاه (حُذف `inspector` منها).
- جديد: `private.is_inspection_entity`, `private.inspection_report_block_reason`, `private.assert_can_issue_inspection_report`, `public.can_issue_inspection_report`.
- قيد `reports_report_kind_check` وُسّع إلى `engineering|administrative|inspection|technical_test`.
- حُدّثت الحراس في `public.create_report`, `public.create_report_version`, `public.approve_report` (الهندسي بحارسه، والفحص/الاختبار بحارسه).
- سُحب EXECUTE من `PUBLIC`/`anon` عن كل الدوال الجديدة والمعدّلة، ومُنح لـ`authenticated` فقط (دوال `private` بلا منح للعميل، تُستدعى من دوال SECURITY DEFINER).
- لم يُحذف أي تقرير أو إصدار.

## الواجهة
- `src/lib/reports.functions.ts`: `reportKind` يقبل الأنواع الأربعة، وأُضيفت `checkInspectionReportEligibility`.
- `src/lib/reports/labels.ts`: تسميات «تقرير فحص»/«تقرير اختبار فني»، رسالة `ENTITY_NOT_INSPECTION`، تحديث نص `ENTITY_NOT_ENGINEERING`، ومعالجة خطأ `INSPECTION_REPORT_FORBIDDEN` بالعربية.
- `src/routes/_authenticated/projects.$projectId.reports.tsx`: خيار «تقرير هندسي» يظهر فقط عند الأهلية الهندسية، وخيارا الفحص/الاختبار يظهران فقط لجهة فحص مؤهلة، مع سقوط تلقائي إلى «تقرير إداري».

## اختبارات القبول
- جرد الكيانات الحالية بعد التعديل: `design_office`=1 مؤهل هندسيًا، `inspector`=1 مؤهل للفحص فقط، `supervision`=2 غير مؤهلة هندسيًا (لا نشاط 7110 مسجّل)، والباقي غير مؤهل — مطابق للقاعدة.
- `tsgo --noEmit` نجح، و`vitest run` 10/10 نجحت.

## ما لم يُثبت
- لا توجد بيانات إشراف بنشاط 7110 في البيئة الحالية، فمسار «مكتب إشراف هندسي مؤهل» تحقق منطقيًا عبر الاستعلام لا عبر حالة حقيقية.
- لم يُنفَّذ نشر (Publish/Deploy) ولم تُعدَّل حسابات أو كلمات مرور.
