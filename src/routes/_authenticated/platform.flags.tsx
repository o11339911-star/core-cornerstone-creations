import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Flag, Package, ShieldCheck } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { getFlagsBoard } from "@/lib/platform-console.functions";
import { formatCount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/flags")({
  component: FlagsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الأعلام والباقات | إدارة ركيز" },
      {
        name: "description",
        content: "أعلام التشغيل حسب الدولة وصلاحيات الباقات الممنوحة للكيانات داخل منصة ركيز.",
      },
      { property: "og:title", content: "الأعلام والباقات | إدارة ركيز" },
      { property: "og:description", content: "أعلام التشغيل وصلاحيات الباقات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function FlagsPage() {
  const fetchBoard = useServerFn(getFlagsBoard);
  const board = useQuery({ queryKey: ["platform-flags"], queryFn: () => fetchBoard() });

  if (board.isPending) return <CardsSkeleton cards={3} />;
  if (board.isError) {
    return <ErrorState description="تعذّر تحميل الأعلام والباقات." onRetry={() => void board.refetch()} />;
  }

  const { flags, entitlements, entityEntitlements, coreFreeActions } = board.data;

  return (
    <div className="space-y-6">
      <PageHero
        title="الأعلام والباقات"
        subtitle="ما يُفعّل تشغيليًا لكل دولة، وما يُمنح تجاريًا لكل كيان — مع بقاء الأفعال الجوهرية خارج أي تقييد."
      />

      <StatGrid>
        <StatCard icon={Flag} label="أعلام التشغيل" value={formatCount(flags.length)} />
        <StatCard icon={Package} label="الصلاحيات المعرّفة" value={formatCount(entitlements.length)} />
        <StatCard
          icon={Building2}
          label="منح فعّالة لكيانات"
          value={formatCount(entityEntitlements.length)}
          tone="success"
        />
      </StatGrid>

      <SectionCard icon={Flag} title="أعلام التشغيل" count={formatCount(flags.length)}>
        {flags.length === 0 ? (
          <SoftEmpty icon={Flag} message="لا توجد أعلام معرّفة." />
        ) : (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li key={flag.code} className="rounded-lg border border-border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{flag.code}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      flag.enabled_globally
                        ? "bg-success-soft text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {flag.enabled_globally ? "مفعّل عالميًا" : "غير مفعّل عالميًا"}
                  </span>
                </div>
                {flag.description_ar ? (
                  <p className="mt-1 text-xs text-muted-foreground">{flag.description_ar}</p>
                ) : null}
                {flag.countries.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {flag.countries.map((country) => (
                      <span
                        key={`${flag.code}-${country.country_code}`}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          country.enabled ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {country.country_code}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={Package} title="صلاحيات الباقات" count={formatCount(entitlements.length)}>
        {entitlements.length === 0 ? (
          <SoftEmpty icon={Package} message="لا توجد صلاحيات معرّفة." />
        ) : (
          <ul className="space-y-2">
            {entitlements.map((item) => (
              <li
                key={item.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.code}</p>
                  {item.description_ar ? (
                    <p className="text-xs text-muted-foreground">{item.description_ar}</p>
                  ) : null}
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold tabular-nums text-primary">
                  {formatCount(item.granted_count)} كيان
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={Building2}
        title="المنح الفعّالة للكيانات"
        count={formatCount(entityEntitlements.length)}
      >
        {entityEntitlements.length === 0 ? (
          <SoftEmpty icon={Building2} message="لا توجد منح فعّالة حاليًا." />
        ) : (
          <ul className="space-y-2">
            {entityEntitlements.map((grant, index) => (
              <li
                key={`${grant.entity_id}-${grant.code}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {grant.entity_name ?? "كيان"}
                  </p>
                  <p className="text-xs text-muted-foreground">{grant.code}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {grant.expires_at ? `حتى ${formatDate(grant.expires_at)}` : "بلا تاريخ انتهاء"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {coreFreeActions.length > 0 ? (
        <SectionCard icon={ShieldCheck} title="أفعال جوهرية لا تُقيَّد بأي باقة">
          <div className="flex flex-wrap gap-1.5">
            {coreFreeActions.map((action) => (
              <span
                key={action}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary"
              >
                {action}
              </span>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
