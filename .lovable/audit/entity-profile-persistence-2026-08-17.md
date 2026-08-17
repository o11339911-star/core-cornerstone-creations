# تدقيق: عدم ظهور بيانات ملف الكيان بعد الحفظ — 2026-08-17

## المصادر canonical
- `public.entities` (الاسم/النوع/الحالة) + `public.entity_profiles` (البيانات الرسمية، البريد `contact_email`، الجوال `contact_phone`، `legal_form_code`).
- `public.entity_activities` (روابط النشاط، `entity_id` + `activity_code` + `is_primary` + `activity_version`) مع القاموس `public.economic_activities` (نسخة `NCEA-2023-ISIC4`) و`public.legal_forms`.
- لم تُنشأ أي نسخة بيانات مكررة.

## الأسباب الجذرية
1. **البريد والجوال**: كانا يُحفظان ويُقرآن فعليًا من `entity_profiles` (تحقق: الكيان 85a6…9fac8e يملك قيمتين مخزنتين)، لكن بطاقة «البيانات الرسمية» في الواجهة **لم تعرض هذين الحقلين إطلاقًا** — لا صف عرض لهما، فبدا الأمر كأن الحفظ لا يثبت.
2. **الشكل النظامي**: كان الحفظ يُنفَّذ من الخادم بتحديث مباشر على `public.entity_profiles`، وللدور `authenticated` **لا يوجد UPDATE grant ولا سياسة UPDATE** على هذا الجدول → لا يُكتب شيء.
3. **الأنشطة**: كل INSERT في `entity_activities` كان يفشل داخل مُشغّل التدقيق `private.audit_entity_activity_change` لأنه يكتب `action = tg_op` بحروف كبيرة (`INSERT`) بينما قيد `permission_audit_action_ck` يقبل الصيغة الصغيرة فقط، ثم — بعد إصلاحها — رفض `permission_audit_object_type_ck` النوع `entity_activities` أصلًا. النتيجة: صفر أنشطة محفوظة لكل الكيانات.
4. **مسار الحذف ثم الإدراج**: كان الحفظ يحذف كل الأنشطة أولًا ثم يفشل الإدراج → فقدان بيانات + «نجاح كاذب» جزئي.

## الإصلاحات
- دالة واحدة ذرية `public.set_entity_classification(...)` (SECURITY DEFINER، `search_path=''`) تتحقق من `private.can(members/manage_members)` ثم:
  - upsert لـ`legal_form_code` فقط عند `_set_legal_form`.
  - تحديث الأنشطة بـ diff (حذف غير المطلوب، إدراج الجديد، ضبط `is_primary` بخطوتين لاحترام قيد «أساسي واحد») فقط عند `_apply_activities`، فلا تُمسح الروابط حين لا تكون الحالة محمّلة.
  - التحقق من رموز النشاط والشكل النظامي، وأخطاء مُرمّزة تُترجم عربيًا في الواجهة.
  - `revoke ... from public, anon` + `grant execute to authenticated`.
- تصحيح `private.audit_entity_activity_change` (`lower(tg_op)`) وتوسيع `permission_audit_object_type_ck` ليشمل `entity_activities`/`entity_profiles`.
- الواجهة: بطاقة «البيانات الرسمية» تعرض البريد والجوال (بالقناع نفسه لغير المخوّل)، وبطاقة التصنيف تُبطل `entity-legal-form` و`entity-activities` و`entity-official` بعد الحفظ قبل رسالة النجاح، ولا ترسل حالة غير محمّلة.

## نتائج الاختبار
| الاختبار | النتيجة |
| --- | --- |
| حفظ شكل نظامي + نشاط أساسي + فرعيين ثم قراءة من القاعدة | PASS (`legal_form_code=person`, 4100 أساسي + 4210/4220) |
| تبديل النشاط الأساسي مع إبقاء الباقي | PASS (`4210` أساسي، `4100` فرعي، `4220` محذوف بالطلب) |
| استدعاء بدون تحميل الأنشطة لا يمسح شيئًا | PASS |
| مستخدم من كيان آخر | PASS — رُفض بـ FORBIDDEN (42501) |
| فشل جزئي = خطأ عربي بلا نجاح كاذب | PASS (كل شيء داخل معاملة واحدة، والخطأ يُعرض مترجمًا) |
| البريد/الجوال يظهران بعد إعادة التحميل | PASS (يُقرآن من `get_entity_official`) |
| typecheck / tests / build | PASS (tsgo نظيف، 10 اختبارات، بناء ناجح) |
| security advisor | لا تنبيهات جديدة من هذه الدفعة (التنبيهات الـ259 سابقة ومعروفة) |

لا نشر، ولا تعديل على الحسابات أو الأرقام الرسمية أو حالة التوثيق.
