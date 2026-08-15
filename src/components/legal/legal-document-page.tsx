import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, Scale, ShieldCheck } from "lucide-react";

import { MarkdownView } from "@/components/legal/markdown-view";
import { PageHero, HeroBadge } from "@/components/rakeez/dashboard-kit";
import type { LegalDocument } from "@/lib/legal.functions";

const NAV = [
  { to: "/legal/privacy", label: "سياسة الخصوصية" },
  { to: "/legal/terms", label: "شروط الاستخدام" },
  { to: "/legal/ip", label: "الملكية الفكرية" },
  { to: "/legal/complaints", label: "الشكاوى والتظلمات" },
] as const;

export const LEGAL_DISCLAIMER =
  "هذه الوثيقة أساس تقني وتشغيلي مشتق من سلوك المنصة الفعلي، وتحتاج مراجعة واعتمادًا من مستشار نظامي سعودي قبل الاعتماد النهائي.";

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function LegalUnavailable({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        لم تُنشر نسخة سارية من هذه الوثيقة بعد.
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        العودة للرئيسية
      </Link>
    </main>
  );
}

export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={doc.title_ar}
        subtitle="وثيقة نظامية سارية على استخدام منصة ركيز"
        badge={<HeroBadge>النسخة {doc.version}</HeroBadge>}
        aside={
          <div className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-4 py-3 text-sm">
            <CalendarDays className="size-4" aria-hidden="true" />
            <span>سارية من {formatDate(doc.effective_date)}</span>
          </div>
        }
      />

      <nav aria-label="الوثائق النظامية" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border border-border bg-card p-1.5 shadow-card sm:w-full">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                activeProps={{
                  className:
                    "bg-secondary text-primary inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
                }}
              >
                <FileText className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
        <Scale className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-foreground">{LEGAL_DISCLAIMER}</p>
      </div>

      <article className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-8">
        <MarkdownView source={doc.body_md} />
      </article>

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
        آخر نشر: <span dir="ltr">{formatDate(doc.published_at)}</span>
      </p>
    </main>
  );
}
