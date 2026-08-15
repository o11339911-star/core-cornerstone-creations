# المرحلة 5 — محرك الصلاحيات (خطة)

## 1. الوضع الحالي والفجوة (مُتحقَّق منه من قاعدة البيانات)

الموجود فعلاً:
- `entity_memberships.role` من نوع `app_role` (owner, admin, manager, member, viewer) + `status` + `expires_at`.
- دوال في مخطط `private` غير مكشوفة عبر REST: `is_entity_member(uid, entity_id)`، `has_role(uid, entity_id, role)`، `can_access_project(uid, project_id)`.
- `projects.owner_id` + `entity_id`، وسياسات RLS تعتمد على العضوية أو أدوار owner/admin/manager.
- `entity_memberships` حالياً: قراءة فقط (لا سياسات INSERT/UPDATE/DELETE) — أي لا مسار لإدارة الفريق إطلاقاً.

الفجوات:
- الصلاحية اليوم = دور خام (role) وليس فعلاً محدداً؛ لا تمييز بين عرض/تعديل/اعتماد/تصدير/مشاركة.
- لا وحدات (modules) في نموذج الصلاحيات: كل الجداول تُقاس بنفس المسطرة.
- لا منح على مستوى مشروع واحد (project-level grant) لعضو أو لكيان خارجي.
- لا حماية صريحة ضد تعديل العضو لدوره الخاص (غياب سياسات الكتابة يمنعها مؤقتاً، لكن أول سياسة كتابة تفتح الثغرة).
- لا سجل تدقيق لأي تغيير صلاحية.

## 2. التصميم: طبقة فوق ما هو مبني، بلا كسر

### أ) قاموس ثابت للأفعال والوحدات (enums)
- `app_action`: `view | create | update | soft_delete | approve | execute | export | share | manage_members`
- `app_module`: `projects | stages | contracts | documents | finance | correspondence | reports | members`

### ب) `role_permissions` (مصفوفة الدور × الوحدة × الفعل) — بيانات مرجعية
- `role app_role`, `module app_module`, `action app_action`, تفرد على الثلاثية.
- Seed مبدئي: owner = كل شيء؛ admin = كل شيء عدا حذف الكيان و`approve` المالي؛ manager = view/create/update/soft_delete/execute/export على projects+stages+documents؛ member = view/create/update على projects+stages+documents؛ viewer = view + export فقط.
- RLS: قراءة للمسجّلين، لا كتابة من العميل (تُدار عبر migration فقط).

### ج) `permission_grants` (استثناءات دقيقة فوق الدور) — append/override
- `subject_user_id uuid null`, `subject_entity_id uuid null` (أحدهما فقط — CHECK)
- `scope_type text` (`entity | project`)، `scope_entity_id`, `scope_project_id`
- `module app_module`, `action app_action`, `effect text` (`allow | deny`)
- `granted_by uuid`, `expires_at`, `revoked_at`, timestamps
- فهارس على مفاتيح النطاق. `deny` يغلب `allow` دائماً.

### د) دالة القرار الواحدة `private.can(uid, module, action, entity_id, project_id)`
منطق ثابت (deny by default):
1. لا سياق (لا كيان ولا مشروع) → `false`.
2. مشروع شخصي (`owner_id = uid`، بلا كيان) → مالك المشروع لديه كل الأفعال.
3. صلاحية الكيان: العضوية نشطة وغير منتهية → `role_permissions` تسمح بالثنائية.
4. `permission_grants`: `deny` مطابق → رفض فوري؛ `allow` مطابق (غير منتهٍ/ملغى) → سماح.
5. سقف الكيان الخارجي: أي منح لمستخدم عبر `subject_entity_id` **مقيَّد** بما مُنح لذلك الكيان أصلاً على المشروع — تُطبَّق بدالة داخلية `private.entity_ceiling(entity_id, project_id, module, action)` قبل قبول أي `allow`.

كل الدوال `SECURITY DEFINER`, `STABLE`, `SET search_path = public`، ولا `GRANT EXECUTE` للعميل إلا لما تحتاجه سياسات RLS.

### هـ) استخدام تدريجي لا كاسر
- سياسات RLS الحالية تبقى كما هي في هذه المرحلة؛ تُعاد صياغتها بحيث تصبح: الشرط القديم **أو** `private.can(...)` — بحيث لا يفقد أحد وصولاً قائماً.
- `can_access_project` يظل موجوداً ويُعاد تعريفه داخلياً فوق `private.can(... 'projects','view' ...)`.

## 3. القواعد الحرجة الثلاث (تُبنى الآلية لدعمها)

1. **لا تعديل ذاتي للدور:** سياسات UPDATE/DELETE على `entity_memberships` تشترط `user_id <> auth.uid()`، وتريجر `prevent_self_role_change` يرفض أي تغيير لـ`role/status/expires_at` عندما `NEW.user_id = auth.uid()`. مالك الكيان الأخير لا يمكن تخفيض دوره (تريجر يمنع ترك الكيان بلا owner).
2. **لا إدارة فريق كيان آخر:** كل سياسة كتابة على `entity_memberships` تمر عبر `private.can(auth.uid(),'members','manage_members', NEW.entity_id, null)` — الدور يُقاس دائماً داخل نفس `entity_id` المستهدف.
3. **لا تجاوز سقف الكيان الخارجي:** تريجر تحقق على `permission_grants` عند الإدراج: إذا كان الموضوع مستخدماً منتمياً لكيان خارجي، يُرفض المنح إن لم يكن ضمن `entity_ceiling`. كذلك يُمنع المانح من منح فعل لا يملكه هو (no privilege escalation by proxy).

## 4. سجل التدقيق `permission_audit_log` (append-only)

- الأعمدة: `id`, `actor_user_id`, `target_user_id`, `target_entity_id`, `target_project_id`, `object_type` (`membership | grant`), `object_id`, `action` (`insert | update | revoke`), `old_value jsonb`, `new_value jsonb`, `created_at`.
- يُكتب حصراً عبر تريجرات `SECURITY DEFINER` على `entity_memberships` و`permission_grants` — لا كتابة مباشرة.
- RLS: قراءة فقط لمن يملك `members.view` على الكيان المعني؛ **لا** INSERT/UPDATE/DELETE لأي دور عميل (append-only حقيقي عبر منع REVOKE من الجداول + غياب السياسات).

## 5. خارج النطاق الآن
لا واجهة إدارة صلاحيات، ولا شاشة أعضاء، ولا دعوات. فقط الأساس الخادمي.

## 6. الترتيب التنفيذي (بعد الموافقة)
1. Migration واحدة: enums + `role_permissions` (+Seed) + `permission_grants` + `permission_audit_log` + دوال `private.can`/`entity_ceiling` + تريجرات المنع والتدقيق + سياسات RLS للجداول الجديدة + GRANT صريح.
2. إعادة صياغة غير كاسرة لسياسات `projects`/`project_stages`/`stage_dependencies` لتشمل `private.can` كمسار إضافي.
3. `src/lib/permissions.functions.ts`: `getMyPermissions(scope)` للقراءة فقط (يستخدم `requireSupabaseAuth`)، بلا أي منح من العميل.
4. اختبار فعلي بثلاثة مستخدمين: عضو يحاول رفع دوره (يجب أن يفشل)، مدير كيان A يحاول تعديل عضوية كيان B (يفشل)، ومنح لمستخدم من كيان خارجي يتجاوز سقف كيانه (يفشل) — ثم التحقق من صفوف `permission_audit_log` وحذف كل بيانات الاختبار.
5. تشغيل Supabase Advisors ومعالجة أي Finding قبل إعلان الاكتمال.
