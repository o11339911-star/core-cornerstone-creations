# الدفعة 4 من 4 — الإشعارات ومراحل المشروع والترجمة (2026-08-17)

## الترحيلات (Migrations)
- `notify_stage_event()` — إثراء payload بـ `stage_name` و`project_name` و`actor_name` و`occurred_at`.
- `public.start_stage(uuid)` — SECURITY DEFINER، `search_path = public`، يتحقق من `auth.uid()` ومن `private.can_manage_stage` وحالة المرحلة (pending/rework) بدل UPDATE مباشر من العميل.
- `public.stage_capabilities(uuid)` — يُرجع `can_start/can_submit/can_approve` وفق الصلاحية والدور والحالة وفصل المهام (المقدِّم/المنفّذ لا يعتمد).
- سحب EXECUTE من PUBLIC وanon للدوال الثلاث، ومنحها لـ`authenticated` فقط (تحقق: anon=false، authenticated=true؛ `notify_stage_event` لا EXECUTE لأحد).

## الملفات
- `src/lib/stages.functions.ts` — `startStage` عبر RPC، وإضافة `getStageCapabilities`.
- `src/lib/audit-labels.ts` (جديد) — مترجم مركزي عربي لأنواع السجلات والأفعال مع fallback مفهوم (لا snake_case ولا أسماء جداول).
- `src/routes/_authenticated/projects.$projectId.stages.tsx` — `validateSearch` لـ`?stage=`، تحديد المرحلة وإبرازها، أزرار مشروطة بالصلاحية الخادمية مع حالة "جارٍ"، خط زمني مترجم مع حالة فارغة، حقل الاسم في النسخة الإنجليزية داخل «تفاصيل إضافية».
- `src/routes/_authenticated/notifications.tsx` — عرض المشروع والمرحلة والمنفّذ والوقت، وإخفاء أي code خام.
- `src/routes/_authenticated/n.$notificationId.tsx` — «فتح» يعلّم كمقروء ويفتح المرحلة المحددة مباشرة.
- `src/i18n/locales/ar.ts` / `en.ts` — «الإنجليزية» بدل English، ومفاتيح المراحل الجديدة.

## اختبارات القبول
- typecheck: نجح. الاختبارات: 10/10 نجحت.
- الأزرار: تظهر فقط عند صلاحية فعلية؛ والمنع خادمي في `start_stage/submit_stage/approve_stage`.
- الإشعار: يفتح `/projects/:id/stages?stage=<id>` ويبرز البطاقة.

## ما لم يُثبت
- لم يُختبر الإشعار الحي end-to-end بحساب معتمِد مستقل (لا إنشاء حسابات اختبار).
- تحذيرات linter القائمة سابقًا خارج نطاق هذه الدفعة لم تُعالج.
- لم يتم أي Publish/Deploy.
