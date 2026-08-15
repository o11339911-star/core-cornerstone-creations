# المرحلة 20 — إدارة ركيز الداخلية

فصل تشغيل المنصة عن تشغيل مشاريع العملاء: أدوار منصة مستقلة، طابور مراجعة موحّد، توزيع آلي متوازن مقاوم للتزامن، وصول Case-based مؤقت، ووصول طارئ Break-glass بموافقة شخص ثانٍ.

## 1) أدوار المنصة (منفصلة تمامًا عن الكيانات)

- `platform_admins` القائم يبقى كما هو (لا إدراج أي صف فيه).
- جدول جديد `platform_staff`: `user_id` (PK)، `role` (نوع جديد `platform_role`: `superadmin` / `reviewer` / `support` / `compliance`)، `availability` (`available` / `busy` / `on_leave` / `suspended`)، `max_concurrent` (حد تشغيلي، افتراضي 5)، `active`، طوابع زمنية.
- دوال مساعدة في `private`: `is_platform_staff(uid)`، `platform_role(uid)`، `platform_can(uid, action)` — كلها `SECURITY DEFINER` وتقرأ `auth.uid()` عند الاستدعاء من الطبقات العليا.
- **لا seed إطلاقًا**: الجدول يبقى فارغًا؛ صاحب المشروع يقرر الأعضاء لاحقًا. الاختبارات تُدرج حسابات `p20-*@example.com` مؤقتًا فقط.
- ربط بمحرك الصلاحيات القائم: `private.can` يُوسَّع بفرع واحد فقط — إن كان المستخدم موظف منصة **ولديه منحة Case-based سارية** على المشروع، يُسمح بالقراءة ضمن نطاق المنحة. الوظيفة وحدها لا تمنح أي وصول.

## 2) طابور المراجعة الموحّد

جدول `platform_queue_items` يشير للمصادر ولا ينسخ بياناتها:
- `source_type` (`entity_verification` / `template_review` / `report` / `support_ticket` / `compliance_task`)، `source_table`، `source_id`، `entity_id`، `project_id` (اختياريان للسياق).
- `status` (`open` / `assigned` / `in_progress` / `resolved` / `closed`)، `priority`، `assigned_to`، `assigned_at`، `resolved_at`، `close_reason`.
- `unique (source_type, source_id) where status <> 'closed'` — يمنع تكرار عنصر لنفس المصدر.
- تريغرات على المصادر: عند `entity_profiles.verified_at` يصبح غير NULL، وعند `report_template_imports.status` يصل إلى حالة نهائية، وعند إغلاق `requests` من نوع بلاغ/دعم ⇒ إغلاق العنصر تلقائيًا مع `close_reason = 'source_resolved'`. تريغرات الإنشاء تفتح العنصر عند نشوء الحاجة.

## 3) التوزيع الآلي المتوازن (مقاوم للسباق)

دالة `public.claim_queue_item(_item_id uuid)` و`public.auto_assign_queue_item(_item_id uuid)`:
1. `pg_advisory_xact_lock(hashtextextended('queue:'||_item_id))` — قفل على مستوى القاعدة.
2. `select ... for update` على الصف، ورفض إن كان `assigned_to is not null`.
3. اختيار الموظف: `availability = 'available'` فقط، و`active`، وعدد مهامه المفتوحة `< max_concurrent`، ترتيب تصاعدي حسب الحمل ثم `assigned_at` الأقدم.
4. فهرس فريد جزئي `unique (source_type, source_id) where status in ('assigned','in_progress')` كضمان ثانٍ.
5. كل إسناد يُسجَّل في `permission_audit_log` (`object_type='platform_queue_item'`, `action='assign'`).

**إعادة التوزيع**: `public.reassign_queue_item(_item_id, _to_user, _reason)` — `_reason` إلزامي (غير فارغ)، والمنفّذ يجب أن يكون `superadmin` أو صاحب صلاحية إعادة توزيع؛ سجل تدقيق `action='reassign'` مع `old_value`/`new_value`، وإشعار للطرفين عبر `emit_notification`.

## 4) وصول Case-based مؤقت

- الوصول يُمنح عبر `permission_grants` القائم (لا جدول موازٍ): `subject_user_id` = موظف المنصة، `scope_type='project'`، `expires_at` إلزامي.
- جدول ربط خفيف `platform_case_access`: `grant_id` ← `permission_grants`، `queue_item_id`، `reason`، `granted_by`، `revoked_at` — لربط المنحة بعنصر الطابور.
- دالة `public.grant_case_access(_item_id, _staff_user_id, _minutes, _reason)`: تتحقق من دور المانح، ومن أن العنصر مسند لهذا الموظف، وتحد المدة بسقف (مثلاً 24 ساعة)، وتنشئ المنحة + السجل + الإشعار.
- انتهاء الصلاحية تلقائي بحكم `expires_at` داخل `private.can` (لا cron مطلوب للتحقق)؛ وتُسجَّل حالة الانتهاء عند أول قراءة مرفوضة عبر مهمة تنظيف اختيارية.

## 5) Break-glass (وصول طارئ)

جدول `platform_breakglass_requests`: `requested_by`، `project_id`، `reason` (إلزامي)، `status` (`pending` / `approved` / `denied` / `expired`)، `approved_by`، `approved_at`، `expires_at`، `grant_id`.
- `public.request_breakglass(_project_id, _reason)` — ينشئ طلبًا معلقًا فقط، **بلا أي وصول**، ويُشعر جميع `superadmin`.
- `public.approve_breakglass(_request_id)` — يرفض إذا كان المعتمد هو الطالب نفسه (فصل واجبات)، ينشئ منحة قصيرة (مثلاً 60 دقيقة) في `permission_grants`، يُشعر فورًا عبر `emit_notification`، ويكتب سجل تدقيق كامل.
- بلا موافقة ⇒ `private.can` لا يجد منحة ⇒ رفض.

## 6) الواجهة (عربية RTL، توكنات الهوية الخضراء فقط)

مسارات جديدة تحت `_authenticated/`:
- `platform.queue.tsx` — الطابور الموحّد: فلاتر بالحالة/النوع/المسند، أزرار «إسناد تلقائي» و«إعادة توزيع» (مع حقل سبب إلزامي).
- `platform.staff.tsx` — موظفو المنصة: الحالة، الحد التشغيلي، الحمل الحالي.
- `platform.breakglass.tsx` — طلبات الوصول الطارئ واعتمادها.
- الوصول لهذه المسارات محجوب لغير موظفي المنصة (تحقق خادمي، وليس إخفاء UI فقط).
- ملف `src/lib/platform-admin.functions.ts` يغلّف كل الدوال أعلاه عبر `requireSupabaseAuth`.

## 7) الأمن والصلاحيات

- كل الجداول الجديدة: RLS مفعّلة، القراءة لموظفي المنصة فقط عبر `private.is_platform_staff`، والكتابة عبر دوال `SECURITY DEFINER` حصرًا.
- بعد المهاجرة مباشرة: `revoke insert, update, delete, truncate ... from anon, authenticated;` و`revoke select ... from anon;` لكل جدول جديد، و`revoke execute ... from anon, public;` لكل دالة جديدة، مع إرفاق ناتج فحص `information_schema.role_table_grants` و`routine_privileges`.

## بوابة القبول (حسابات `p20-*@example.com` فقط)

1. استدعاءان متوازيان لـ`auto_assign_queue_item` على نفس العنصر ⇒ إسناد واحد فقط.
2. موظف `on_leave` / `suspended` ⇒ لا يستلم إسنادًا.
3. موظف بلغ `max_concurrent` ⇒ يُتجاوز للأقل حملًا.
4. موظف منصة بلا منحة ⇒ رفض قراءة المشروع؛ بمنحة ⇒ نجاح؛ بعد إنهاء المدة يدويًا (`expires_at` للماضي) ⇒ رفض.
5. Break-glass بلا موافقة ⇒ رفض؛ باعتماد من شخص ثانٍ ⇒ نجاح + إشعار + سجل تدقيق؛ اعتماد ذاتي ⇒ رفض.
6. تعيين `verified_at` لكيان اختبار ⇒ عنصر الطابور يُغلق تلقائيًا.

بعد التحقق تُحذف كل بيانات `p20-*` بالكامل، بما فيها صفوف `platform_staff`، ويُترك الجدول فارغًا.
