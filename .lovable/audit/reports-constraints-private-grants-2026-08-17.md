# تدقيق إغلاق: قيود نوع التقرير وصلاحيات الدوال الداخلية — 2026-08-17

## السبب الجذري
1. عند توسيع أنواع التقارير أُضيف قيد جديد `reports_report_kind_check` (أربعة أنواع) دون إزالة القيد
   القديم `reports_report_kind_chk` (نوعان فقط). PostgreSQL يطبّق كل قيود CHECK معًا، فكان
   `inspection` و`technical_test` مرفوضين فعليًا رغم دعم التطبيق لهما.
2. دوال الأهلية الداخلية في مخطط `private` وُرثت منح EXECUTE لـPUBLIC عند إنشائها، فبقيت
   `is_engineering_entity` و`assert_can_issue_engineering_report` و`engineering_report_block_reason`
   قابلة للتنفيذ من دور `authenticated` رغم أنها helpers داخلية تُستدعى من دوال SECURITY DEFINER وtriggers.

## ما نُفِّذ
- `alter table public.reports drop constraint if exists reports_report_kind_chk;` — لم تُعدَّل أي صفوف.
- سحب كل الصلاحيات من `public, anon, authenticated` على:
  `private.is_engineering_entity`, `private.is_inspection_entity`,
  `private.assert_can_issue_engineering_report`, `private.assert_can_issue_inspection_report`,
  `private.engineering_report_block_reason`, `private.inspection_report_block_reason`.
- تثبيت `public.can_issue_engineering_report` و`public.can_issue_inspection_report` على `authenticated` فقط
  (مسحوبة من `public`/`anon`).
- تحقق مسبق: لا توجد أي سياسة RLS تشير إلى هذه الدوال الداخلية، فلا كسر لتقييم السياسات
  (القاعدة الدائمة: كل دالة `private` مستخدمة داخل سياسة تحتاج EXECUTE لـauthenticated — لا ينطبق هنا).

## نتائج الاختبار الفعلية
- القيود المتبقية على `report_kind`: `reports_report_kind_check` فقط ✔
- إدراج `inspection` = نجح، `technical_test` = نجح (داخل transaction أُلغي بالكامل، صفر صفوف جديدة) ✔
- إدراج نوع غير مسموح `bogus_kind` = مرفوض بالقيد ✔
- trigger `trg_reports_engineering_issuer` نشط ويمنع `engineering` من غير المؤهل
  (`ENGINEERING_REPORT_FORBIDDEN`) ✔
- بسياق `authenticated`: استدعاء `private.is_engineering_entity` مباشرة = `permission denied for function` ✔
- صلاحيات الدوال الداخلية الست لـ`authenticated` = false، ولـ`anon` = false ✔
- `public.can_issue_engineering_report` و`can_issue_inspection_report`: authenticated=true، anon=false،
  وتُرجعان سبب المنع (`ENTITY_NOT_ENGINEERING` / `ENTITY_NOT_INSPECTION`) للكيان غير المؤهل ✔
- `tsgo --noEmit`: بلا أخطاء ✔ (لا تغييرات كود تطبيقي في هذه الدفعة)
- Supabase Linter: لا نتائج جديدة ناتجة عن هذه الدفعة؛ التحذيرات المتبقية سابقة وخارج النطاق.

لا نشر، ولا حذف بيانات، ولا تعديل حسابات.
