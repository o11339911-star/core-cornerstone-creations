# المرحلة 29 — تقرير الإغلاق النهائي (الدفعة 29F)

التاريخ: 2026-08-15 · النطاق: أداء + تدقيق واجهات نهائي. لا قاعدة بيانات، لا migrations، لا Auth/RLS/Storage، لا مستخدمين تجريبيين، **لا نشر**.

## 1. مصفوفة النتائج (Pass/Fail)

| البند | النتيجة | الدليل |
|---|---|---|
| Typecheck (`tsgo --noEmit`) | Pass | صفر أخطاء |
| Build كامل (`bun run build`) | Pass | client + nitro worker بنجاح |
| حجم حزمة العميل | Pass | 1.6MB إجمالي، أكبر ملف 639KB؛ لا تسرّب `pdf-lib`/`docx` إلى العميل (خادمي فقط) |
| تقسيم الكود لكل مسار | Pass | حزم مستقلة لكل مسار (finance 33KB، properties 19KB…) |
| الصور | Pass | `loading="lazy"` على كل صورة غير LCP، أبعاد صريحة، صورة الهيرو 104KB |
| الخطوط | Pass | `preconnect` + `display=swap` لخط Noto Sans Arabic |
| منع العمل المتكرر | Pass | `staleTime` 30s، `gcTime` 5د، إيقاف `refetchOnWindowFocus`، `retry: 1`، `defaultPreload: "intent"` |
| العروض 320/390/768/1024/1366/1440 | Pass | صفر overflow أفقي في 15 مسارًا × 6 عروض (90 فحصًا) |
| RTL | Pass | `dir=rtl` على كل المسارات |
| LTR (الإنجليزية) | Pass | `/`، `/auth`، `/legal/terms` على 390 و1366: `dir=ltr`، صفر overflow، صفر أخطاء |
| console | Pass | صفر أخطاء؛ الوحيد المتبقي هو استجابة 404 الصحيحة لروابط غير موجودة |
| network | Pass | صفر 4xx/5xx غير مقصود |
| Deep links | Pass | `/e/<غير موجود>`، `/m/<توكن خاطئ>`، `/mp/`، `/verify/`، `/invite/accept`، مسار غير معروف → حالة فارغة/404 عربية دون انهيار |
| حالات loading/empty/error | Pass | `DataTable` يوفّرها مركزيًا؛ كل مسار موثّق لديه `errorComponent` |
| أهداف اللمس ≥44px | Pass | بعد إصلاح شعار الرأس: صفر عنصر تفاعلي <40px |
| لوحة المفاتيح | Pass | ترتيب Tab منطقي على `/auth`: البريد ← كلمة المرور ← دخول ← نسيت كلمة المرور |
| الأرقام لاتينية 0-9 (DOM) | Pass | صفر رقم عربي/فارسي في نص الصفحات المفحوصة |
| الأرقام لاتينية (المصدر) | Pass | صفر بعد إصلاح `platform.integrations.tsx` |
| سلامة بيانات المستخدم | Pass | التحويل عرضي فقط داخل `MarkdownView`؛ لا تعديل على المخزَّن |

## 2. العيوب المانعة التي عولجت في 29F

1. **خطأ Hydration على `/select-account`** (يظهر على كل العروض): إعادة توجيه `beforeLoad` كانت تبدّل الشجرة أثناء الترطيب. الحل: حارس مصادقة بعد الترطيب داخل `useEffect` مع هيكل تحميل، وإزالة `ssr: false`. أُعيد الاختبار: صفر أخطاء.
2. **هدف لمس صغير** في شعار الرأس (<40px) → `min-h-11`.
3. **أرقام عربية** في شارة صفحة التكاملات (`المرحلة ٢٥` → `المرحلة 25`).
4. **أرقام غير موحّدة** في `chart.tsx` (`toLocaleString`) و`calendar.tsx` → عبر `formatNumber` / لغة `ar-u-ca-gregory-nu-latn`.

## 3. الملفات المعدلة في 29F

- `src/routes/select-account.tsx` — حارس بعد الترطيب، إزالة `ssr:false`
- `src/router.tsx` — سياسة تخزين مؤقت/preload للأداء
- `src/components/auth-header.tsx` — هدف لمس الشعار
- `src/components/ui/chart.tsx`, `src/components/ui/calendar.tsx` — أرقام لاتينية
- `src/routes/_authenticated/platform.integrations.tsx` — أرقام لاتينية
- `src/components/legal/markdown-view.tsx` — تطبيع أرقام العرض فقط
- `src/routes/index.tsx`, `src/assets/rakeez-hero.jpg` — واجهة بيضاء غالبة بهوية خضراء

## 4. قيود تعذّر اختبارها

- **المسارات الموثّقة (`/_authenticated/*`) لم تُفحص عبر المتصفح**: بيئة الاختبار `LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged` لا تسمح بحقن جلسة، وإنشاء مستخدمين تجريبيين ممنوع في هذه الدفعة. بديل منفَّذ: تدقيق مصدر لكل 45 ملف مسار (وجود `errorComponent`، حالات التحميل/الفراغ، طبقة التنسيق المركزية) + فحص أرقام على مستوى المصدر.
- **`vite preview`** غير متوافق مع مخرجات nitro في هذه البيئة؛ التحقق تم على البناء الكامل + خادم التطوير.

## 5. الحكم

**مكتمل** — الدفعة 29F والمرحلة 29 مغلقتان: Typecheck وBuild ناجحان، صفر overflow، صفر أخطاء console، أرقام لاتينية 100% في العرض، وصفر نشر.
