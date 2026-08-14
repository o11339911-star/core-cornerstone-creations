# المرحلة 0 — تقرير الحالة الحالية لمنصة ركيز

> **تاريخ الإنشاء:** 2026-08-14 UTC  
> **نوع التقرير:** قراءة فقط — لا يحتوي على تعديلات كود أو بيانات  
> **نطاق المرحلة 0:** تثبيت خط الأساس (Baseline Audit) فقط.

---

## 1. ملخص تنفيذي

المشروع حاليًا عبارة عن **صفحة هبوط ساكنة واحدة** باللغة العربية تحت اسم "ركيز"، مبنية على `TanStack Start v1` + `React 19` + `Vite 8` + `Tailwind CSS v4`. لا توجد أي وظائف خلفية، ولا مصادقة، ولا قاعدة بيانات، ولا لوحة تحكم، ولا نظام أدوار، ولا i18n، ولا مدفوعات، ولا إشعارات. جميع مكونات المنصة المطلوبة غائبة بالكامل.

---

## 2. المكدس التقني (Stack)

| الطبقة | التقنية | الإصدار | ملاحظة |
|--------|---------|---------|--------|
| إطار العمل | TanStack Start v1 | `1.168.32` | يستخدم `@tanstack/react-start` |
| التوجيه | TanStack Router | `1.170.18` | مسار واحد فقط `/` |
| واجهة المستخدم | React | `^19.2.0` | SSR مفعّل |
| بناء الأصول | Vite | `^8.2.0` | عبر `@lovable.dev/vite-tanstack-config` |
| التنسيق | Tailwind CSS | `^4.2.1` | Native CSS `@theme` variables |
| مكتبة المكونات | shadcn/ui | — | جميع المكونات الافتراضية موجودة |
| إدارة الحالة/الجلب | TanStack Query | `^5.101.1` | مُهيأة في `src/router.tsx` لكن غير مستخدمة |
| التحقق من الصحة | Zod | `^3.24.2` | مثبت لكن غير مستخدم |
| النماذج | react-hook-form | `^7.71.2` | مثبت لكن غير مستخدم |
| الرسوم البيانية | recharts | `^2.15.4` | مثبت لكن غير مستخدم |
| الخط | Noto Sans Arabic | — | يُحمل من Google Fonts |

### 2.1 الحزم المثبتة (dependencies)

```text
@hookform/resolvers, @radix-ui/* (كامل), @tailwindcss/vite, @tanstack/react-query,
@tanstack/react-router, @tanstack/react-start, @tanstack/router-plugin,
class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react,
input-otp, lucide-react, react, react-day-picker, react-dom, react-hook-form,
react-resizable-panels, recharts, sonner, tailwind-merge, tailwindcss,
tw-animate-css, vaul, vite-tsconfig-paths, zod
```

### 2.2 أدوات التطوير (devDependencies)

```text
@eslint/js, @lovable.dev/vite-tanstack-config, @types/node, @types/react,
@types/react-dom, @vitejs/plugin-react, eslint, eslint-config-prettier,
eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh,
globals, nitro, prettier, typescript, typescript-eslint, vite
```

---

## 3. هيكل الملفات

```text
/
├── .lovable/
│   ├── audit/              ← هذا التقرير وثلاثة تقارير أخرى
│   ├── plan.md             ← خطة المرحلة 0 المعتمدة
│   └── project.json
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── README.md
├── bunfig.toml
├── components.json         ← إعدادات shadcn/ui
├── eslint.config.js
├── package.json
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── assets/
│   │   └── rakeez-hero.jpg
│   ├── components/ui/      ← 43 مكون shadcn افتراضي
│   ├── hooks/use-mobile.tsx
│   ├── lib/
│   │   ├── error-capture.ts
│   │   ├── error-page.ts
│   │   ├── lovable-error-reporting.ts
│   │   └── utils.ts
│   ├── routeTree.gen.ts    ← مولّد تلقائيًا
│   ├── router.tsx          ← إعداد TanStack Router + QueryClient
│   ├── routes/
│   │   ├── README.md
│   │   ├── __root.tsx      ← تخطيط الجذر، الخط، الـ RTL، 404، خطأ عام
│   │   └── index.tsx       ← صفحة الهبوط الوحيدة
│   ├── server.ts           ← مدخل SSR
│   ├── start.ts            ← تهيئة TanStack Start
│   └── styles.css          ← نظام ألوان ركيز المخصص
├── tsconfig.json
└── vite.config.ts          ← يستخدم @lovable.dev/vite-tanstack-config
```

---

## 4. حالة Git والبيئة

### 4.1 الالتزامات الأخيرة

```text
5ac3f2e Add project README
b8d1cb6 Update plan
f89a6f5 Changes
5f84346 Added skipped questions
02ca8cb Changes
```

### 4.2 الفروع المحلية

```text
* edit/edt-24f80a3c-22bf-49a8-98ed-53f531a7380b
  edit/edt-2d87cf4c-2c10-4671-8184-0572a3f01d0f
  edit/edt-a7399bb2-2f9f-4c9a-8418-b4cda91ca64
  edit/edt-bb24effc-727d-4613-a29c-650a824552c5
  main
```

### 4.3 الفروع البعيدة

```text
remotes/origin/112741065011
remotes/origin/HEAD -> origin/main
remotes/origin/main
```

### 4.4 الـ remotes

- `origin`: مستودع Lovable الداخلي (`git.private.lovable-gcp.code.storage/...`)
- `secondary`: نسخة احتياطية على S3 (`s3://lovable-repositories/...`)
- **لا يوجد remote يشير إلى `github.com/1127410650/11`** في هذه النسخة.

### 4.5 ملاحظة حول GitHub

في سياق سابق، أُبلغ المستخدم أن الربط مع GitHub تم عبر واجهة Lovable، لكن الـ remote الفعلي في هذه البيئة لا يزال يشير إلى مستودع Lovable الداخلي. أي ربط خارجي غير مُثبت في `.git/config` الحالي. لا توجد أي أسرار أو مفاتيح ظاهرة في هذا التقرير.

---

## 5. حالة Lovable Cloud / Supabase

| البند | الحالة |
|-------|--------|
| Lovable Cloud مفعّل | **لا** |
| مجلد `supabase/` | غير موجود |
| مجلد `src/integrations/supabase/` | غير موجود |
| Migration | لا يوجد |
| جداول | لا يوجد |
| سياسات RLS | لا يوجد |
| دوال Edge | لا يوجد |
| Triggers | لا يوجد |
| Views | لا يوجد |
| Storage Buckets | لا يوجد |

> **قرار معماري معتمد مسبقًا:** سيتم استخدام Supabase مستقل (غير Lovable Cloud) في المرحلة 1، لكن التفعيل الفعلي لم يُعتمد بعد ولم يُنفذ.

---

## 6. حالة واجهة المستخدم الحالية

صفحة الهبوط الوحيدة (`src/routes/index.tsx`) تحتوي على:

1. **Header لزق (sticky)** مع روابط تنقل داخلية (`#hero`, `#services`, `#about`, `#contact`) وزر "ابدأ الآن".
2. **قسم Hero** بصورة خلفية تجريدية، عنوان رئيسي، نص فرعي، وزران دعوة.
3. **قسم Features** يعرض 3 بطاقات: استراتيجية رقمية، تصميم وتطوير، حلول مبتكرة.
4. **قسم About** مع إحصائيات وهمية (+50 مشروع، +30 عميل، 5+ سنوات).
5. **قسم Contact** بنموذج اتصال وهمي (لا يرسل بيانات).
6. **Footer** بروابط داخلية وحقوق النشر.

### 6.1 ملاحظات تقنية على الواجهة

- اللغة العربية مكتوبة مباشرة داخل الملفات؛ لا يوجد نظام i18n.
- التصميم RTL عبر `dir="rtl"` في `__root.tsx`.
- نظام ألوان مخصص: `rakeez-navy`، `rakeez-gold`، `rakeez-cream`، `rakeez-sand`.
- لا يوجد dark-mode toggle، لكن متغيرات `.dark` موجودة في CSS.
- نموذج الاتصال لا يُرسل أي بيانات (فقط `e.preventDefault()`).

---

## 7. المكونات والأصول

### 7.1 الأصول

| المسار | الوصف |
|--------|-------|
| `src/assets/rakeez-hero.jpg` | صورة Hero تجريدية (أزرق داكن + ذهبي) |
| `public/favicon.ico` | الأيقونة الافتراضية |
| `public/robots.txt` | يسمح بفهرسة كل شيء |

### 7.2 مكونات shadcn/ui المثبتة

جميع المكونات الافتراضية موجودة (43 مكونًا) لكنها غير مستخدمة في الصفحة الحالية. تشمل: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

---

## 8. الإعدادات الرئيسية

### 8.1 `vite.config.ts`

يستخدم `@lovable.dev/vite-tanstack-config` مع توجيه مدخل SSR إلى `src/server.ts`.

### 8.2 `tsconfig.json`

يستخدم مسارات alias قياسية (`@/*` → `./src/*`)، و `target: ES2022`، و `moduleResolution: bundler`.

### 8.3 `components.json`

إعدادات shadcn/ui: baseColor `stone`، CSS variables، Tailwind v4.

### 8.4 `src/server.ts` و `src/start.ts`

ملفات تهيئة TanStack Start القياسية. لا تحتوي على منطق تطبيقي.

---

## 9. الثغرات والمخاطر المبدئية

| # | المخاطر/الثغرة | التأثير | الحل المقترح |
|---|---------------|---------|--------------|
| 1 | لا يوجد نظام مصادقة | أي شخص يمكنه الوصول لكل شيء لاحقًا | تنفيذ Supabase Auth في المرحلة 1 |
| 2 | لا توجد أدوار مستخدمين | لا يمكن التمييز بين المسؤول والعميل | جدول `user_roles` + RLS في المرحلة 1 |
| 3 | لا توجد قاعدة بيانات | لا يمكن حفظ المستخدمين أو الطلبات | تصميم مخطط البيانات في المرحلة 1 |
| 4 | نموذج الاتصال وهمي | لا يتم تخزين الرسائل | توصيله بـ DB/Email في مرحلة لاحقة |
| 5 | لا يوجد i18n | لا يمكن دعم لغات إضافية | إضافة نظام ترجمة في مرحلة لاحقة |
| 6 | لا توجد صفحات قانونية | غياب سياسة الخصوصية والشروط | إنشاء `/privacy` و `/terms` |
| 7 | لا يوجد نظام إشعارات | لا تنبيهات للمستخدمين أو الإدارة | تنفيذ notifications في مرحلة لاحقة |
| 8 | لا توجد مدفوعات | لا يمكن تحصيل رسوم | دمج بوابة دفع في مرحلة لاحقة |

---

## 10. الخلاصة

المشروع في حالته الحالية هو **صفحة هبوط ساكنة جميلة بالعربية** فقط. جميع البنية التحتية للمنصة (مصادقة، قاعدة بيانات، أدوار، لوحات تحكم، طلبات، مدفوعات، إشعارات، i18n) غير موجودة. لا توجد تعارضات تقنية — فقط غياب كامل للوظائف. المرحلة 1 القادمة يجب أن تركز على تفعيل Supabase وتصميم المخطط البياني للبيانات وبناء نظام المصادقة والأدوار.
