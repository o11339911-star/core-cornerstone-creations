# المرحلة 6 — فرق عمل الكيانات والظهور (خطة)

## 1. البناء فوق الموجود

مؤكَّد من المخطط الحالي:
- `entity_memberships` (role, status, expires_at, invited_by) + تريجرات: منع تعديل الدور الذاتي، إلزام بقاء owner نشط، تدقيق تلقائي في `permission_audit_log`.
- `private.can(uid, module, action, entity_id, project_id)` + `role_permissions` + `permission_grants` + `private.can_access_project`.
- `projects` و`project_stages` مع سياسات تعتمد `can_access_project`.

الفجوة: لا دعوات، لا إسناد لمشروع/مرحلة، لا ظهور، لا نقل مهام.

## 2. الجداول الجديدة

### أ) `entity_invitations`
- `entity_id`, `email` (lowercase)، `role app_role`، `token_hash text` (sha256 للتوكن — لا يُخزَّن التوكن الخام أبداً)، `status text` (`pending | accepted | expired | revoked`)، `expires_at` (افتراضي 7 أيام)، `invited_by`, `accepted_by`, `accepted_at`, timestamps.
- فهرس فريد جزئي: دعوة `pending` واحدة لكل (entity_id, email).
- RLS: القراءة/الإنشاء/الإلغاء لمن يملك `members.manage_members` على `entity_id` عبر `private.can`. لا قراءة عامة (التوكن لا يُقرأ من العميل إطلاقاً).
- القبول لا يمر عبر RLS بل عبر دالة `SECURITY DEFINER`.

### ب) `project_assignments`
- `project_id`, `stage_id` (nullable — إسناد على مستوى المشروع أو مرحلة بعينها)، `user_id`, `entity_id`, `job_title_ar/_en` (الاسم الوصفي)، `starts_on`, `ends_on`, `status` (`active | ended | transferred`)، `visibility`, `created_by`, timestamps, `deleted_at`.
- القاعدة الجوهرية: **الانضمام للكيان لا يمنح وصولاً لأي مشروع**. الوصول لمشروع = ملكية، أو منح صريح في `permission_grants`، أو إسناد نشط هنا. سيُوسَّع `private.can` ليقرأ الإسناد النشط (ضمن نافذة التاريخ و`status='active'`) كمصدر صلاحية على مستوى المشروع، مع بقاء المنطق القديم كما هو (غير كاسر).

### ج) `assignment_transfers` (سجل نقل المهام)
- `from_assignment_id`, `to_assignment_id`, `project_id`, `reason`, `transferred_by`, `created_at`. append-only.

### د) نوع الظهور
- enum `visibility_level`: `internal | limited | project_wide`.
- عمود `visibility` على `project_assignments` (وافتراضي على العضوية: `internal`).
- `limited` يحتاج جدول مرافق `assignment_visibility_audience(assignment_id, audience_entity_id | audience_user_id)`.

## 3. الظهور والاسم الوصفي

- View `public.project_assignments_public`: تُرجع لكل مُشاهد إما الاسم الحقيقي (من `profiles`) أو `display_name` الوصفي («فريق المقاول — مسؤول التنفيذ») حسب:
  - `project_wide` → الاسم الحقيقي لكل من يصل للمشروع.
  - `limited` → الاسم الحقيقي لأعضاء الجمهور المحدد فقط، وإلا الوصفي.
  - `internal` → الاسم الحقيقي لأعضاء نفس الكيان فقط، وإلا الوصفي.
- الإخفاء **عرضي فقط**: `user_id` الحقيقي يبقى في الجدول الأساسي وفي `permission_audit_log`، ولا يُحذف ولا يُبدَّل أبداً.
- الـ View بـ `security_invoker = true` كي تحترم RLS.

## 4. القبول والدعوة (دوال خادمية)

- `accept_entity_invitation(_token text)` — `SECURITY DEFINER`:
  1. hash التوكن ومطابقته.
  2. رفض إن `status <> 'pending'` أو `expires_at < now()` (مع تحديثها إلى `expired`).
  3. رفض إن كان بريد المستخدم الحالي مختلفاً عن بريد الدعوة.
  4. إنشاء `entity_memberships` مرة واحدة (قيد فريد على (user_id, entity_id))؛ إن وُجدت عضوية نشطة → رفض.
  5. تحديث الدعوة إلى `accepted` + `accepted_by/at`. كل ذلك داخل معاملة واحدة.
- التوكن الخام يُولَّد داخل server function ويُعاد **مرة واحدة فقط** للمُرسِل لعرض رابط `/invite/accept?token=...` لنسخه يدوياً. لا بريد إلكتروني في هذه المرحلة.

## 5. خروج الموظف

server function `offboardMember(entityId, userId, replacementUserId?)`:
1. `entity_memberships.status = 'inactive'` (لا حذف) — التريجر الحالي يمنع ترك الكيان بلا owner ويسجّل التدقيق.
2. إلغاء المنوح غير المنتهية: `permission_grants.revoked_at = now()`.
3. إنهاء الإسنادات النشطة (`status='ended'`, `ends_on = today`)، وإن وُجد بديل: إنشاء إسناد جديد بنفس المشروع/المرحلة/الوظيفة + صف في `assignment_transfers`.
4. لا مساس بأي مستند/عقد موقّع سابقاً ولا بأي صف تدقيق.

## 6. الواجهة (حد أدنى)

- `/_authenticated/entities/$entityId/team`: قائمة الأعضاء (دور، حالة، ظهور)، دعوة عضو (نموذج + عرض رابط الدعوة للنسخ)، إلغاء دعوة، إنهاء عضوية/نقل مهام.
- `/invite/accept`: صفحة عامة تطلب تسجيل الدخول ثم تستدعي القبول.
- كل الأزرار محكومة بـ `private.can(... 'members','manage_members' ...)` عبر `getMyPermissions`.
- i18n ar/en لكل النصوص الجديدة، RTL افتراضي.

## 7. الملفات المتوقعة

- Migration واحدة: enum + 4 جداول + GRANTs + RLS + الدوال + توسعة `private.can` + View + تريجرات updated_at/تدقيق.
- `src/lib/team.functions.ts` (دعوة/إلغاء/قبول/إسناد/خروج) — كلها `requireSupabaseAuth`.
- `src/routes/_authenticated/entities.$entityId.team.tsx`، `src/routes/invite.accept.tsx`.
- إضافات على `src/i18n/locales/ar.ts` و`en.ts`.

## 8. الاختبار الفعلي قبل الإعلان

1. دعوة → قبول ينجح مرة واحدة؛ إعادة القبول/بعد الانتهاء/بعد الإلغاء → يفشل.
2. عضو جديد بلا إسناد: لا يرى أي مشروع للكيان. بعد إسناد لمشروع واحد: يرى ذلك المشروع فقط.
3. الظهور: مشاهد خارجي يرى الاسم الوصفي، وعضو الكيان يرى الاسم الحقيقي، وصف التدقيق يحمل الهوية الحقيقية دائماً.
4. الخروج: فقدان الوصول فوراً، الإسناد منقول للبديل مع صف تحويل، والمستندات السابقة سليمة.
5. حذف كل بيانات الاختبار + تشغيل Supabase Advisors ومعالجة أي Finding.

## 9. خارج النطاق
إرسال بريد الدعوات، إشعارات، واجهة إدارة صلاحيات تفصيلية.
