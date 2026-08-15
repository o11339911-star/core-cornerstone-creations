# المرحلة 15-ب — استيراد القوالب وإدارة قوالب ركيز

الدفعة أ مغلقة (نموذج البيانات، المحرر، الاعتماد، الختم، DOCX). هذه الدفعة تضيف **إنتاج القوالب من مصادر خارجية** وواجهة **إدارة قوالب ركيز المعزولة**. لا تمسّ `reports` / `report_versions` / `report_assets` بأي تعديل.

## 0. الوضع الحالي المتحقق منه (أساس الخطة)

- `report_templates` موجود: `owner_scope` (`rakeez`/`entity`)، `entity_id`، `code`، `name_ar/en`، `language`، `direction`، `page_setup`، `content` (blocks)، `source` (`builtin`/`editor` فقط)، `status` (`draft`/`active`/`archived`)، `reviewed_by`، `reviewed_at`.
- RLS الحالي: سياسة **SELECT فقط** — قوالب ركيز `active` مقروءة للجميع، وقوالب الكيان مقروءة لأعضائه. **لا توجد أي سياسة INSERT/UPDATE/DELETE**، أي أن أي كتابة على القوالب اليوم مستحيلة من العميل. هذه الخطة تضيف الكتابة عبر دوال SECURITY DEFINER فقط، لا عبر سياسات كتابة مباشرة.
- قيد `report_templates_scope_ck` يضمن أن قالب ركيز `entity_id IS NULL` وقالب الكيان له كيان — العزل بنيوي وليس واجهيًا.

## 1. تعديلات قاعدة البيانات (هجرة واحدة)

- توسيع `source` ليقبل `docx_import` و`pdf_import` (تعديل قيد CHECK).
- جدول جديد `report_template_imports` (سجل الاستيراد وتقرير ما لم يُنقل):
  `id`, `template_id` (nullable حتى نجاح الإنشاء), `owner_scope`, `entity_id`, `kind` (`docx`/`pdf`), `storage_bucket`, `storage_path` (معرّفات فقط), `file_ext`, `mime_type`, `size_bytes`, `checksum_sha256`, `status` (`uploaded`/`parsed`/`failed`/`applied`), `blocks_created` int, `dropped_report` jsonb (قائمة العناصر المُسقطة وسببها), `warnings` jsonb, `created_by`, timestamps. RLS: قراءة/كتابة لعضو الكيان المخوّل فقط؛ سجلات ركيز لمدير المنصة فقط. GRANTs صريحة (`authenticated` + `service_role`).
- دوال SECURITY DEFINER (كل واحدة تتحقق من `private.can` قبل أي كتابة):
  - `create_template_import(...)` — يسجّل الرفع بعد فحص الامتداد/MIME/الحجم.
  - `apply_template_import(_import_id, _content, _page_setup, _name_ar, _name_en, _language)` — ينشئ القالب بحالة **`draft`** دائمًا، ويربط `template_id`، ويضبط `source` حسب النوع.
  - `activate_report_template(_template_id)` — يفعّل القالب. **يرفض** أي قالب `source='pdf_import'` لم يُملأ فيه `reviewed_by`؛ ويسجّل `reviewed_by = auth.uid()` و`reviewed_at = now()` عند التفعيل اليدوي.
  - `update_report_template(...)` / `archive_report_template(_template_id)` — تعديل وأرشفة (لا حذف صلب).
  - `upsert_rakeez_template(...)` — مخصصة لقوالب ركيز: تشترط `owner_scope='rakeez'` و`entity_id IS NULL` وصلاحية مدير المنصة، ولا تقبل أي `entity_id` مهما أُرسل.
- سجل تدقيق: كل استيراد/تفعيل/أرشفة يُكتب في `report_audit_log` القائم (فاعل + وقت + `template_id`).
- Bucket خاص `report-imports` (غير عام)، مسار معرّفات فقط: `{entity_id|rakeez}/{import_id}.{ext}`. سياسات التخزين تمنع القراءة العامة؛ التحميل يتم عبر رابط موقّع **60 ثانية** من دالة خادمية (نفس نمط م14/15-أ).

## 2. صرامة فحص الملفات (نفس مستوى المرحلة 14)

- الامتدادات المسموحة: `docx` فقط للمسار الأول، `pdf` فقط للثاني. لا شيء غيرهما.
- المرفوض صراحة: `svg`, `html`, `htm`, `exe`, `js`, `zip`, `doc` القديم، وأي امتداد مزدوج (`x.pdf.exe`).
- MIME المسموح: `application/vnd.openxmlformats-officedocument.wordprocessingml.document` و`application/pdf` فقط.
- تحقق مزدوج: الامتداد + MIME + **magic bytes** فعليًا على الخادم (`PK\x03\x04` لـ DOCX، `%PDF-` لـ PDF) — لا يُوثق بما يرسله المتصفح.
- الحد الأقصى: 15MB. تُحسب `checksum_sha256` وتُخزَّن.
- الفشل في أي فحص ⇒ رفض قبل الرفع للتخزين، مع رسالة سبب واضحة، وتسجيل المحاولة.

## 3. استيراد DOCX ⇒ blocks

- خطوة خادمية `parseDocxTemplate` في `src/lib/reports/docx-import.server.ts`: فك ZIP وقراءة `word/document.xml` مباشرة (بلا مكتبات Node-only ولا عمليات فرعية — بيئة Worker).
- خريطة التحويل إلى أنواع البلوكات القائمة فقط:
  - `w:pStyle=Heading1/2/3` ⇒ `heading` (level 1–3)
  - فقرة عادية ⇒ `paragraph`
  - `w:numPr` ⇒ `list` (ordered حسب `numFmt`)
  - `w:tbl` ⇒ `table` (أول صف = header، حد 12 عمودًا/300 صفًا كما في المخطط)
  - `w:br type=page` أو `w:lastRenderedPageBreak` ⇒ `page_break`
  - `w:drawing` ⇒ `image` **placeholder بدون ملف** (الصور لا تُنقل في هذه الدفعة؛ تُسجَّل في تقرير المُسقطات)
  - نص بالنمط `{{field:entity.name}}` ⇒ `field` إذا كان المصدر ضمن `FIELD_SOURCES` القائمة، وإلا `paragraph` مع تحذير
  - اتجاه البلوك من `w:bidi` ⇒ `dir: rtl|ltr`
- كل ما لا يُطابق (مربعات نص، أشكال، حقول Word، تذييلات معقدة، ترقيم متعدد المستويات، تنسيقات محرف) **يُسقط** ويُسجَّل في `dropped_report` بالنوع والموضع والسبب.
- كل blocks ناتجة تمرّ على `reportContentSchema` (Zod) قبل الحفظ؛ ما يفشل التحقق يُسقط ويُسجَّل. **لا HTML خام إطلاقًا.**
- الواجهة تعرض بعد التحليل: عدد البلوكات المنقولة، جدول "ما لم يُنقل"، ومعاينة القالب. **لا وعد بتطابق بصري.** القالب يُنشأ `draft` ويُفتح في محرر القوالب للتهذيب قبل التفعيل.

## 4. تحويل PDF ⇒ قالب (مراجعة بشرية إلزامية)

- استخراج نصي/بنيوي مبدئي فقط (`src/lib/reports/pdf-import.server.ts`): استخراج تدفق النصوص وأسطرها وترتيب الصفحات باستخدام مسار JS/WASM متوافق مع Worker؛ لا OCR ولا تحليل تخطيط متقدم في هذه الدفعة (يُذكر صراحة للمستخدم).
- الاستدلال المحافظ: سطر قصير + خط أكبر ⇒ `heading`؛ سطر يبدأ برمز نقطي/رقم ⇒ عنصر `list`؛ فاصل صفحة ⇒ `page_break`؛ الباقي ⇒ `paragraph`. الجداول **لا** تُستنتج تلقائيًا (تُسجَّل كنص + تحذير).
- شاشة المراجعة `/_authenticated/entities/$entityId/report-templates/imports/$importId`:
  عمودان جنبًا إلى جنب — يسار/يمين حسب الاتجاه: صور صفحات/نص PDF الأصلي مقابل محرر البلوكات المستخرجة القابل للتعديل (نفس محرر 15-أ). المستخدم يعدّل، يحذف، يعيد ترتيب، ويحوّل بلوكًا إلى نوع آخر.
- زر "اعتماد القالب" مفعّل فقط لصاحب صلاحية `report_template.review` داخل الكيان. عند الاعتماد: `reviewed_by`, `reviewed_at`, `status='active'`.
- **الحارس الحقيقي في قاعدة البيانات**: `activate_report_template` ترفض تفعيل أي `pdf_import` بلا `reviewed_by` — لا يُعتمد على الواجهة.

## 5. إدارة قوالب ركيز (عزل صارم)

- مسار جديد `/_authenticated/admin/report-templates` (مدير المنصة فقط): قائمة، إنشاء، تعديل في المحرر، أرشفة، معاينة. لا حذف صلب.
- العزل مطبّق على ثلاث طبقات:
  1. **بنيوي**: قيد `scope_ck` يجعل قالب ركيز بلا `entity_id`.
  2. **دوال**: `upsert_rakeez_template` و`archive_report_template` تعملان على `owner_scope='rakeez'` فقط وتتجاهلان أي `entity_id` مُرسل.
  3. **صلاحيات**: دوال الخادم الخاصة بهذه الشاشة (`src/lib/report-templates.functions.ts`) **لا تستعلم إطلاقًا** عن `reports` / `report_versions` / `report_assets` / `projects` / `properties`؛ ولا تستخدم `supabaseAdmin`.
- **مراجعة RLS مطلوبة ضمن الهجرة**: التأكد أن مدير المنصة لا يملك سياسة SELECT واسعة على `reports`/`report_versions`/`report_assets` تمنحه رؤية بيانات المشاريع من هذا الطريق. إن وُجدت مثل هذه السياسة، تُضيّق في نفس الهجرة. سياسات القوالب تُضاف بحيث تسمح لمدير المنصة بقراءة قوالب ركيز `draft`/`archived` أيضًا (اليوم يرى `active` فقط).
- اختبار الإثبات: تسجيل الدخول كمدير منصة واستعلام مباشر عن `reports` و`report_versions` ⇒ يجب أن يعود **0 صفوف**.

## 6. عناصر قوالب متقدمة — الحد الأدنى فقط

نضيف فقط ما يحتاجه الاستيراد فعليًا، ولا نوسّع المخطط بلا سبب:
- توسيع `FIELD_SOURCES` بحقول ترويسة ناقصة فقط إن ظهرت حاجة أثناء التحويل (رقم الرخصة، تاريخ الانتهاء، رقم الصك) — إن كانت موجودة فلا تغيير.
- `page_setup` يقبل نص ترويسة/تذييل مخصصًا لكل قالب (سطر واحد لكل منهما) — يكفي لاستيراد ترويسات DOCX البسيطة.
- **مرفوض في هذه الدفعة**: أنماط محارف حرة، ترويسات متعددة لكل قسم، حقول محسوبة، عناصر HTML.

## 7. الملفات المتوقعة

- هجرة واحدة (توسيع `source`، جدول الاستيراد، الدوال، bucket، مراجعة RLS).
- `src/lib/reports/docx-import.server.ts`, `src/lib/reports/pdf-import.server.ts`
- `src/lib/report-templates.functions.ts` (استيراد، تطبيق، تفعيل، أرشفة، رابط موقّع 60 ثانية)
- `src/routes/_authenticated/entities.$entityId.report-templates.tsx` (قائمة + رفع)
- `src/routes/_authenticated/entities.$entityId.report-templates.imports.$importId.tsx` (مراجعة جنبًا إلى جنب)
- `src/routes/_authenticated/admin.report-templates.tsx` (إدارة قوالب ركيز)
- ترجمات ar/en، وتحديث `.lovable/audit/00-route-inventory.md`

## 8. بوابة القبول (تُختبر حيًا بعد التنفيذ)

1. استيراد ملف DOCX حقيقي ⇒ قالب `draft` ببلوكات صحيحة + تقرير "ما لم يُنقل" غير فارغ ومفهوم.
2. استيراد ملف PDF حقيقي ⇒ قالب `draft`؛ محاولة تفعيله بلا مراجعة **تفشل من قاعدة البيانات**؛ بعد المراجعة والاعتماد يصبح `active`.
3. القالبان مستخدمان فعليًا في إنشاء تقرير من الدفعة أ.
4. رفض مثبت لـ `svg`/`html`/`exe`/امتداد مزدوج/ملف >15MB/ملف PDF مزيّف الامتداد (فشل magic bytes).
5. مدير المنصة داخل شاشة قوالب ركيز: استعلام مباشر على `reports`/`report_versions`/`report_assets` يعود بـ 0 صفوف.
6. عضو كيان لا يرى قوالب كيان آخر ولا سجلات استيراده.

## خارج النطاق

- تطابق بصري كامل مع الملف الأصلي.
- OCR للـ PDF الممسوح ضوئيًا، ونقل الصور من DOCX.
- إصلاح bidi في تصدير PDF (بند مؤجل مستقل من الدفعة أ).
