import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, LayoutGrid } from "lucide-react";

import { ErrorState, PageHero, SectionCard } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/platform/studio")({
  component: PlatformStudioPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الاستديو | إدارة ركيز" },
      {
        name: "description",
        content: "سطح إدارة المحتوى والوسائط في منصة ركيز: قوالب التقارير والمحتوى التسويقي وواجهة السوق.",
      },
      { property: "og:title", content: "الاستديو | إدارة ركيز" },
      { property: "og:description", content: "إدارة المحتوى والوسائط والقوالب من مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** أسطح موجودة فعلًا في المشروع ويصلها الاستديو مباشرة. */
const CONNECTED = [
  {
    to: "/platform/report-templates",
    label: "قوالب التقارير",
    description: "مراجعة واعتماد قوالب التقارير الهندسية على مستوى المنصة.",
    icon: FileText,
  },
] as const;

/** أسطح لا يوجد لها backend بعد — تُعرض كبنية غير مفعّلة بلا أزرار كاذبة. */
const NOT_WIRED = [
  "المحتوى التسويقي العام للمنصة",
  "مكتبة وسائط مركزية للمنصة",
  "بنوك الصور والهوية البصرية",
  "جدولة نشر المحتوى العام",
];

function PlatformStudioPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="الاستديو"
        subtitle="سطح إدارة المحتوى والوسائط — يوصل الأنظمة القائمة ولا ينشئ نظامًا موازيًا."
        aside={
          <Button asChild className="min-h-11 gap-2">
            <Link to="/platform/report-templates">
              <FileText className="size-4" aria-hidden="true" />
              قوالب التقارير
            </Link>
          </Button>
        }
      />

      <SectionCard icon={LayoutGrid} title="أسطح موصولة" count={CONNECTED.length}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CONNECTED.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="flex h-full min-h-11 flex-col gap-1 rounded-xl border border-border p-4 transition-colors hover:bg-secondary"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <item.icon className="size-4 text-primary" aria-hidden="true" />
                  {item.label}
                </span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard icon={LayoutGrid} title="بنية غير مفعّلة" count={NOT_WIRED.length}>
        <p className="mb-3 text-xs text-muted-foreground">
          هذه الأسطح لا يوجد لها مصدر بيانات في المنصة حتى الآن، لذلك تُعرض كبنية معلنة فقط دون إجراءات.
        </p>
        <ul className="space-y-2">
          {NOT_WIRED.map((label) => (
            <li
              key={label}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground"
            >
              <span>{label}</span>
              <Badge variant="outline">غير مفعّل</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
