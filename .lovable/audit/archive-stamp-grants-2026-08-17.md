# تقرير تدقيق أمني — إغلاق منح `public.issue_archive_stamp`

**التاريخ:** 2026-08-17  
**الهدف:** إزالة صلاحية `EXECUTE` الممنوحة خطأً لـ `anon` على دالة `public.issue_archive_stamp`، لأنها عملية إصدار/كتابة (SECURITY DEFINER) وليست تحققًا عامًا.

---

## 1. التغيير المنفذ

```sql
REVOKE EXECUTE ON FUNCTION public.issue_archive_stamp(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_archive_stamp(uuid, text, uuid) TO authenticated;
```

- لم تُعدّل `public.verify_archive_file` ولا `public.verify_report` ولا أي صفحة تحقق عامة؛ هذه متعمدة public read-only.
- لم تُعدّل بيانات الملفات أو البصمات.

---

## 2. التحقق من المنح

| الدور | EXECUTE على `issue_archive_stamp` |
|-------|-----------------------------------|
| `public` | `false` |
| `anon` | `false` |
| `authenticated` | `true` |

استعلام التحقق:

```sql
select has_function_privilege('anon', 'public.issue_archive_stamp(uuid, text, uuid)', 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', 'public.issue_archive_stamp(uuid, text, uuid)', 'EXECUTE') as auth_exec;
```

النتيجة: `anon_exec = false`، `auth_exec = true`.

---

## 3. الاختبارات الوظيفية

أُجريت داخل هجرات مؤقتة باستخدام DO blocks مع إعادة ضبط الدور، وتم حذف جداول/دوال الاختبار فورًا بعد الانتهاء.

| الاختبار | النتيجة |
|----------|---------|
| `anon_call` | `denied as expected` — مرفوض عند مستوى المنح |
| `auth_authorized` | `success and rolled back` — صاحب العنصر نجح في إصدار البصمة وتم تراجع الكتابة فورًا |
| `auth_unauthorized` | `denied as expected: FORBIDDEN` — مستخدم مصرح لكنه غير صاحب/غير مخول للعنصر |

تفاصيل الاختبار الناجح:
- المرجع: `RKZ-R69G-BR9K-W5FS`
- البصمة: `000000000000`
- الحالة: `valid`
- الجهة المصدرة: `شركة محمد عبيد الشمري العقارية`

---

## 4. نتيجة Supabase Security Advisor / Linter

- عدد التنبيهات بعد الإغلاق: 258 (انخفض بمقدار تنبيه واحد بعد حذف جدول الاختبار المؤقت).
- لم يعد `issue_archive_stamp` ضمن دوال `SECURITY DEFINER` القابلة للتنفيذ من `anon`.
- بقيت التنبيهات العامة عن `SECURITY DEFINER` مرتبطة بالدوال العامة المقصودة فقط، مثل:
  - `public.verify_archive_file`
  - `public.verify_report`
  - `public.get_public_entity_profile`
  - `public.get_public_media`
  - `public.list_legal_documents`
  - `public.get_legal_document`
  - `public.verify_marketing_package`

هذه دوال قراءة عامة مقصودة ولم تُعدّل.

---

## 5. الفحوصات الأخرى

- **TypeScript typecheck:** ✅ ناجح (`bunx tsgo`)
- **Production build:** ✅ ناجح (`bun run build`)
- **نشر:** لم يُنشر.

---

## 6. الخلاصة

أُغلق المنح الزائد على `public.issue_archive_stamp`: لم يعد `anon` يستطيع استدعاءها، ولا تزال `authenticated` تستطيع إصدار البصمات وفق فحوص `auth.uid()` والوصول للعنصر. جميع الاختبارات ناجحة، ولم تتأثر بيانات الأرشيف أو البصمات.
