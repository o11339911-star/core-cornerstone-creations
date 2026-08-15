# المرحلة 21 — ملفات الكيانات ومواقعها العامة

الهدف: ملف عام اختياري (opt-in) لكل كيان على مسار `/e/{slug}`، يعمل بدون تسجيل دخول، بحقول عامة allowlist فقط، مع سابقة أعمال منشورة من `portfolio_entries` القائمة.

## 1. طبقة البيانات

جدول جديد واحد فقط: `public.entity_public_profiles` (سجل واحد لكل كيان، منفصل تمامًا عن `entity_profiles` الذي يحوي بيانات حساسة: `cr_number`, `contact_email`, `contact_phone`, `address_text`).

الحقول (كلها عامة بطبيعتها):
- `entity_id` (PK، مرجع `entities`)
- `slug` (فريد، lowercase)
- `display_name_ar` / `display_name_en` — الاسم التجاري المعروض
- `activity_ar` / `activity_en` — النشاط
- `services` (text[]) — الخدمات
- `regions` (text[]) — المناطق (مستوى مدينة/منطقة فقط، لا عناوين دقيقة)
- `bio_ar` / `bio_en` — نبذة
- `logo_url` (رابط عام فقط، لا مسار تخزين خاص)
- `website_url`, `public_email`, `public_phone` — اختيارية، يدخلها الكيان صراحة كوسائل تواصل معلنة (مستقلة عن الحقول الخاصة في `entity_profiles`؛ خالية افتراضيًا)
- `is_published` (boolean، افتراضي false)
- `portfolio_opt_in` (boolean، افتراضي false) — موافقة نشر سابقة الأعمال
- `published_at`, `created_at`, `updated_at`

ملاحظة صريحة: علامة التوثيق **لا تُخزن هنا**؛ تُشتق للعرض فقط من `entity_profiles.verified_at IS NOT NULL`.

GRANTs: `SELECT/INSERT/UPDATE` لـ`authenticated` فقط عبر سياسات RLS المرتبطة بصلاحية إدارة الكيان (`private.can(..., 'members','manage_members')` أو ما يعادلها للكيان)، و`ALL` لـ`service_role`. **لا أي grant لـ`anon`** — الوصول العام يمر عبر الدالة العامة حصرًا.

RLS deny-by-default:
- قراءة/تعديل: أعضاء الكيان المصرّح لهم فقط.
- لا سياسة `anon` إطلاقًا.

## 2. توليد الـslug

دالة `private.generate_entity_slug(_name text)`:
- تطبيع (lowercase، إزالة التشكيل، استبدال المسافات بـ`-`، إزالة الرموز، دعم النقل الحرفي للعربية أو fallback إلى `entity`).
- عند التعارض: إلحاق `-2`, `-3`… حتى يتوفر slug فريد (حلقة على `EXISTS`).
- تغيير الـslug لاحقًا: عبر دالة `public.set_entity_slug(entity_id, slug)` مع فحص `auth.uid()` وصلاحية إدارة الكيان، وقيد فريد على مستوى الجدول.

## 3. الدالة العامة الآمنة

`public.get_public_entity_profile(_slug text) returns jsonb`
- `SECURITY DEFINER`, `STABLE`, `SET search_path = public`.
- الاستثناء المقصود الثاني (بعد `verify_report`): `GRANT EXECUTE TO anon, authenticated`. لا تفحص `auth.uid()` لأنها قراءة allowlist عامة صرفة.
- تعيد `NULL` إذا: لا وجود للـslug، أو `is_published = false`، أو الكيان محذوف/غير نشط — **بنفس المخرجة تمامًا** (لا كشف وجود، لا رسالة خطأ مختلفة).
- بناء JSON حقلًا حقلًا بـ`jsonb_build_object` — **ممنوع** `to_jsonb(row)` أو `row_to_json`.
- المفاتيح المُعادة (allowlist نهائية): `slug, display_name_ar, display_name_en, activity_ar, activity_en, services, regions, bio_ar, bio_en, logo_url, website_url, public_email, public_phone, is_verified, portfolio`.
- **لا يُعاد** `entity_id` ولا أي uuid داخلي إطلاقًا (المفتاح الوحيد للعرض هو الـslug).
- `is_verified` = `entity_profiles.verified_at IS NOT NULL` — قيمة عرض فقط.
- `portfolio`: مصفوفة تُبنى فقط إذا `portfolio_opt_in = true`، من `portfolio_entries` حيث `entity_id` مطابق و`is_public = true`، بحقول: `title_ar, title_en, summary_ar, summary_en, project_type_code, city, district, completed_on`. لا `project_id`، لا `id`، لا أي معرّف.

دالة مساعدة `private.public_portfolio_json(_entity_id uuid)` لبناء المصفوفة، بـEXECUTE مسحوب من PUBLIC.

## 4. دوال الإدارة (مسجّلي الدخول)

`public.upsert_entity_public_profile(...)` و`public.set_entity_public_publish(entity_id, is_published, portfolio_opt_in)`:
- `SECURITY DEFINER` + فحص `auth.uid()` + فحص صلاحية إدارة الكيان عبر محرك `private.can`.
- إنشاء slug تلقائيًا عند أول upsert إن لم يوجد.
- تسجيل في `permission_audit_log` عند تغيير حالة النشر (مع توسعة قيود الجدول للأفعال/الكائنات الجديدة إن لزم).

## 5. سحب الصلاحيات (إلزامي بعد الـmigration)

في نهاية نفس الـmigration:
```sql
revoke all on function <كل دالة جديدة> from public;
```
لكل دالة في `public` و`private` على حد سواء، ثم منح EXECUTE صراحة:
- `get_public_entity_profile` → `anon, authenticated`
- دوال الإدارة → `authenticated` فقط
- دوال `private.*` → لا أحد (تُستدعى من definer فقط)

ثم `revoke insert, update, delete, truncate ... from anon` وتحقق من `information_schema.role_table_grants` و`routine_privileges` وإرفاق النتيجة.

**تطبيق درس المرحلة 20**: أي فرع صلاحية جديد يطابق الوحدة والفعل معًا (`module` و`action`)، لا الفعل وحده.

## 6. الواجهة

- `src/lib/entity-public.functions.ts`: 
  - `getPublicEntityProfile` — server fn عام (بلا `requireSupabaseAuth`) يستخدم عميل publishable داخل الـhandler ويستدعي الـRPC. صالح للاستدعاء من loader عام أثناء SSR.
  - `getMyEntityPublicProfile` / `saveEntityPublicProfile` / `setPublishState` — محمية بـ`requireSupabaseAuth`.
- `src/routes/e.$slug.tsx` — صفحة عامة خارج `_authenticated`:
  - loader يستدعي الدالة العامة؛ `notFound()` عند `null`، مع `errorComponent` و`notFoundComponent`.
  - `head()` خاص بالصفحة: title/description/og:title/og:description من الحقول العامة فقط (+ `og:image` من `logo_url` فقط إن كان رابط https مطلق).
  - تصميم بالهوية الخضراء ومكوّنات `dashboard-kit` القائمة: هيدر بالشعار والاسم والنشاط وشارة توثيق (بصرية فقط)، شرائح الخدمات والمناطق، نبذة، شبكة بطاقات سابقة الأعمال.
  - حالة فارغة مصممة (لا سابقة أعمال منشورة / لا نبذة) وحالة ممتلئة.
- `src/routes/_authenticated/entity.public-profile.tsx` — نموذج تحرير الملف العام + مفتاح تفعيل النشر + مفتاح موافقة نشر سابقة الأعمال + معاينة الرابط `/e/{slug}` وزر تعديل الـslug.

## 7. التحقق من بوابة القبول

حساب/كيان اختبار جديد حصرًا (`p21-*@example.com` + كيان `p21`). ممنوع لمس الحسابات الدائمة أو `admin@rakeez.app`.

1. كيان غير منشور ⇒ `get_public_entity_profile` تعيد `NULL` (استدعاء كـ`anon`).
2. بعد التفعيل ⇒ الصفحة `/e/{slug}` تُحمّل بلا جلسة (تحقق بـPlaywright من متصفح بلا session) وتعرض الحقول.
3. **فحص التسرب**: التقاط JSON الخام من الـRPC وفحصه نصيًا مقابل قيم مزروعة عمدًا في `entity_profiles` (بريد، جوال، cr_number، عنوان) وقيم `entity_id`/`tenant_id`/`project_id` — يجب ألا يظهر أي منها. الفحص آلي بمطابقة نصية على كل قيمة حساسة معروفة، وإرفاق النتيجة.
4. مدخل سابقة أعمال `is_public=false` لا يظهر؛ `true` يظهر. وإيقاف `portfolio_opt_in` يخفي المصفوفة كاملة.
5. علامة التوثيق تظهر للموثق فقط + إثبات بالبحث في الكود/القاعدة أن `verified_at` و`is_verified` لا يظهران في أي شرط صلاحية أو ترتيب أو أهلية.
6. إنشاء كيانين بنفس الاسم ⇒ slug ثانٍ فريد تلقائيًا.

## ملاحظات تقنية

- لا جداول جديدة لسابقة الأعمال — إعادة استخدام `portfolio_entries` و`portfolio_assets` القائمة من المرحلة 18.
- `logo_url` عام منفصل عن `entity_profiles.logo_path` (مسار تخزين خاص) لتفادي تسريب مسارات داخلية.
- الصفحة العامة SSR-on (لا `ssr: false`) لتعمل روابط المشاركة وSEO.
