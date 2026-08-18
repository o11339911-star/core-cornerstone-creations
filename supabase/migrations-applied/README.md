# مهاجرات مطبَّقة على القاعدة — 2026-08-18

الملفات 01–10 **طُبقت كلها بنجاح** على قاعدة بيانات المشروع عبر اتصال إدارة مباشر
(خارج تكامل Lovable المعطّل بـ `SUPABASE_FORBIDDEN`). لا تُعِد تطبيقها.

نصوص هذا المجلد حُدّثت لتطابق ما نُفّذ فعلًا، وتشمل التصحيحات الستة التالية:

1. **03 (وpostpone في 02)** — استُبدلت كل استدعاءات
   `private.can(uid, entity, 'entities'|'appointments', 'manage')` بدالة جديدة
   `private.is_entity_manager(_uid, _entity)` (عضوية نشطة بدور owner/admin/manager).
2. **كل الملفات** — `public.update_updated_at_column()` غير موجودة؛ التريغرات تستخدم
   `public.set_updated_at()`.
3. **06** — وُسّع `appointment_participants_side_check` ليشمل `'guest'`.
4. **10** — في `admin_delete_user` المفتاح الصحيح من `evaluate_erasure_constraints`
   هو `can_fully_erase` (كان `can_erase` فيمنع الحذف دائمًا).
5. **10** — `admin_set_entity_verification` تُحدّث
   `entity_profiles.verification_status` (+`verified_at`/`verified_by`/`verification_note`)
   لأن `entities` لا تحتوي عمود توثيق.
6. **10** — وُسّع `service_listings_status_check` بقيمة `'removed'`، ووُسّع قيدا
   `permission_audit_log` (`action` و`object_type`) بقيم `admin.*` والأنواع الجديدة
   (user, profile, identity, entity, entity_membership, project, service_listing,
   marketing_asset, entity_public_profile).

الكود في `src/` لم يعد يحتوي أي مسار احتياطي من نوع «بانتظار تفعيل قاعدة البيانات»:
أي خطأ من القاعدة يُعرض الآن كرسالة عربية مفهومة مع إعادة المحاولة.
