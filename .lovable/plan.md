# المرحلة 11 — المراحل والتنفيذ والزيارات الميدانية

## 1. المبدأ العام

المرحلة تُدار كـ"وحدة تنفيذ" لها أصحاب أدوار، وسجل تنفيذ يومي، وزيارات ميدانية موثّقة، وملاحظات فنية بدورة حياة واضحة، ولا تُغلق إلا باستيفاء معايير إكمال معلنة + اعتماد صريح من شخص غير المنفّذ.

لا نكرر ما هو قائم: `project_stages` و`stage_dependencies` (المرحلة 4) هما مصدر الحقيقة للمراحل والتبعيات، و`private.can` (المرحلة 5) هو محرك الصلاحية الوحيد، و`permission_audit_log` (المرحلة 5) هو سجل التدقيق الوحيد.

## 2. تعديلات على الموجود (توسيع لا استبدال)

- `project_stages`: إضافة `parent_stage_id` (مرحلة فرعية داخل مرحلة رئيسية، مع منع الدوران عبر تريجر ومنع تجاوز مستويين)، و`actual_start` / `actual_end`، و`completion_note`، و`approved_by` / `approved_at`.
- توسيع قيم `project_stages.status` لتشمل دورة حياة أوضح: `pending → in_progress → submitted → approved` مع `rework` و`skipped`. الانتقالات المسموحة تُفرض بتريجر (لا قفزة من `pending` إلى `approved`).
- `permission_audit_log`: توسيع قائمة `object_type` لتشمل كيانات هذه المرحلة (`project_stages`, `stage_roles`, `stage_progress`, `site_visits`, `stage_observations`, `observation_actions`, `stage_attachments`)، وتوسيع `action` بقيمة `status_change`. لا جدول تدقيق موازٍ.

## 3. الجداول الجديدة

- `stage_roles` — من يشغل أي دور على المرحلة: `stage_id`, `user_id`, `entity_id`, `role` ∈ (`responsible`, `executor`, `reviewer`, `approver`), `assigned_by`, `starts_on`, `ends_on`, `status`.
- `stage_completion_criteria` — معايير الإكمال: `stage_id`, `code`, `label_ar/en`, `is_required`, `evidence_type` ∈ (`file`, `visit`, `checklist`, `text`), `weight`.
- `stage_criteria_results` — استيفاء المعيار: `criterion_id`, `satisfied`, `evidence_attachment_id`, `evidence_visit_id`, `note`, `recorded_by`.
- `stage_progress` — تحديثات التقدّم: `stage_id`, `percent` (0-100)، `note`, `reported_by`, `reported_at` (سطر لكل تحديث، غير قابل للتعديل أو الحذف).
- `site_visits` — الزيارة الميدانية: `stage_id`, `project_id`, `visited_by`, `visit_start`, `visit_end`, `summary`, `weather_note`, `location_consent` (منطقي، افتراضي false)، `location_reason` ∈ (`inspection`, `handover`, `incident`, `other`).
- `site_visit_locations` — الإحداثيات الدقيقة في جدول منفصل (نفس نمط `property_exact_locations` من المرحلة 7): `visit_id`, `lat`, `lng`, `accuracy_m`. لا يُكتب سطر هنا إلا مع `location_consent = true` وسبب مذكور (تريجر يفرض ذلك).
- `stage_observations` — ملاحظة فنية / عدم مطابقة: `stage_id`, `visit_id`, `kind` ∈ (`note`, `nonconformity`), `severity` ∈ (`low`, `medium`, `high`, `critical`), `title`, `body`, `status`, `raised_by`, `due_on`.
- `observation_actions` — الإجراء التصحيحي: `observation_id`, `action_text`, `assigned_to`, `due_on`, `status`, `completed_at`, `completed_by`.
- `observation_reinspections` — إعادة الفحص: `observation_id`, `action_id`, `inspected_by`, `result` ∈ (`passed`, `failed`), `note`, `visit_id`.
- `stage_attachments` — المرفقات والصور: `stage_id`, `visit_id`, `observation_id`, `file_path`, `file_hash`, `mime_type`, `kind` ∈ (`photo`, `document`, `report`), `uploaded_by`. الملفات نفسها في bucket خاص.

## 4. دورات الحالة

```text
المرحلة:      pending -> in_progress -> submitted -> approved
                             ^              |
                             +--- rework <--+            (skipped من pending فقط)

الملاحظة:     open -> action_assigned -> action_done -> reinspection -> closed
                                                    \-> failed -> action_assigned

الإجراء:      assigned -> in_progress -> done -> verified | rejected
```

كل انتقال حالة يُسجَّل تلقائيًا في `permission_audit_log` بـ `action = 'status_change'` مع القيمة القديمة والجديدة، عبر تريجر AFTER — والجدول أصلًا append-only ومحمي من الكتابة المباشرة.

## 5. قاعدة منع الاعتماد الذاتي (فصل المهام)

- اعتماد المرحلة يتم حصريًا عبر دالة `public.approve_stage(_stage_id, _note)`:
  - يجب أن يملك المُعتمِد `private.can(..., 'stages', 'approve', ...)`.
  - يجب أن تكون المرحلة في حالة `submitted`.
  - يجب أن تكون كل المعايير الإلزامية مستوفاة، وكل عدم مطابقة `high`/`critical` مغلقة.
  - **يُرفض** إذا كان المُعتمِد هو نفسه من قدّم المرحلة (`submitted_by`) أو مسجَّلًا عليها بدور `executor` — نفس نمط `decide_contract_extension` في المرحلة 10.
- إعادة الفحص (`observation_reinspections`) لا يجوز أن يقوم بها منفّذ الإجراء التصحيحي نفسه.
- الفصل قابل للتعطيل على مستوى المشروع فقط بعلم واضح (`projects.requires_segregation`، افتراضي `true`)، ويُسجَّل أي تعطيل في سجل التدقيق.

## 6. الوصول والخصوصية

- كل جداول المرحلة 11 عليها RLS، والقراءة تمر عبر `private.stage_in_scope` + `private.can(..., 'stages'|'documents', 'view', ...)`، بحيث لا يرى الطرف الخارجي إلا المراحل المتفق عليها في نطاقه (المرحلة 9).
- سياسات القراءة تُكتب بأسلوب "بيانات السطر" (تمرير `stage_id`/`project_id` للدالة) وليس بإعادة الاستعلام عن نفس الجدول، تفاديًا لمشكلة عدم ظهور السطر فور إنشائه التي عولجت في المرحلة 10.
- الموقع الدقيق للزيارة محجوب افتراضيًا: يظهر فقط لمن يملك `view_exact`، ولا يُخزَّن أصلًا بلا موافقة صريحة وسبب. الزائر يرى دائمًا موقعه هو.
- كل الدوال الجديدة `SECURITY DEFINER` تبدأ بفحص `auth.uid()` ثم `private.can(...)`، و`EXECUTE` محجوب عن `anon`.

## 7. التخزين

bucket خاص جديد `stage-evidence` بنفس نمط `property-documents`:
- غير عام، مسار `project_id/stage_id/...`.
- سياسات storage تعتمد على نفس دوال الصلاحية.
- الرفع والقراءة عبر server functions تُصدر signed URL قصيرة الأجل بعد فحص صلاحية خادمي؛ لا وصول مباشر من المتصفح بمفتاح.

## 8. طبقة التطبيق

- `src/lib/stages.functions.ts`: قائمة المراحل بشجرة رئيسية/فرعية، تحديث التقدّم، تقديم المرحلة، اعتمادها، إدارة الأدوار والمعايير.
- `src/lib/site-visits.functions.ts`: إنشاء زيارة (مع الموافقة على الموقع)، رفع الصور، الملاحظات والإجراءات وإعادة الفحص، وإصدار signed URLs.
- الواجهات: `projects.$projectId.stages.tsx` (شجرة المراحل + التبعيات + الحالة)، `projects.$projectId.stages.$stageId.tsx` (الأدوار، المعايير، التقدّم، الخط الزمني، المرفقات)، و`projects.$projectId.visits.tsx` (الزيارات والملاحظات).
- مفاتيح i18n عربية/إنجليزية لكل الحالات والأدوار والرسائل.

## 9. ترتيب التنفيذ عند الاعتماد

1. Migration: توسيع `project_stages` و`permission_audit_log`، الجداول التسعة الجديدة، الدوال المساعدة، التريجرات، RLS + GRANTs.
2. إنشاء bucket `stage-evidence` وسياساته.
3. server functions ثم الواجهات وi18n.
4. اختبارات حية بحسابات واضحة الأسماء (`p11-*`)، ثم حذف كامل لبيانات الاختبار والمستخدمين والملفات، ثم Supabase Advisors ومعالجة أي Finding.

## 10. اختبارات القبول

1. منفّذ المرحلة يحاول اعتماد عمله → رفض صريح؛ معتمِد آخر ينجح.
2. اعتماد مرحلة بمعيار إلزامي غير مستوفٍ أو عدم مطابقة حرجة مفتوحة → رفض.
3. رفع ملف وحده لا يغيّر حالة المرحلة إلى `approved`.
4. زيارة بلا موافقة موقع → لا يُخزَّن أي إحداثي؛ ومع موافقة، الإحداثي محجوب عمن لا يملك `view_exact`.
5. دورة عدم مطابقة كاملة: فتح → إجراء → إعادة فحص فاشلة → إجراء جديد → إعادة فحص ناجحة → إغلاق، مع ظهور كل انتقال في الخط الزمني وعدم إمكانية تعديله أو حذفه.
6. طرف خارجي يرى مراحل نطاقه فقط، ولا يرى ملاحظات مراحل خارج نطاقه.
