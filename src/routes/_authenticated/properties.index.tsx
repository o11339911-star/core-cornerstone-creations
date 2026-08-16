import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, ErrorState, HeroBadge, PageHero } from "@/components/rakeez";
import { useT } from "@/i18n";
import { listProperties, type PropertyListItem } from "@/lib/properties.functions";
import { useAccountUi } from "@/lib/account-ui";
import { CardsSkeleton, SoftEmpty } from "@/components/rakeez";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/properties/")({
  component: PropertiesPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الملفات العقارية | ركيز" },
      {
        name: "description",
        content: "سجل عقاراتك الموحّد في ركيز: الملكية والصكوك والرخص والوحدات وارتباط كل عقار بمشاريعه.",
      },
      { property: "og:title", content: "الملفات العقارية | ركيز" },
      {
        property: "og:description",
        content: "سجل عقاراتك الموحّد في ركيز: الملكية والصكوك والرخص والوحدات والمشاريع المرتبطة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PropertiesPage() {
  const t = useT();
  const navigate = useNavigate();
  const fetchProperties = useServerFn(listProperties);

  const account = useAccountUi();
  const entityId = account.isDeveloper ? (account.activeEntity?.id ?? null) : null;

  const query = useQuery({
    queryKey: ["properties", entityId],
    queryFn: () => fetchProperties({ data: { entityId: entityId! } }),
    enabled: Boolean(entityId),
  });

  const columns = [
    {
      id: "name",
      header: t("properties.name"),
      cell: (row: PropertyListItem) => (
        <span className="font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      id: "kind",
      header: t("properties.kind"),
      cell: (row: PropertyListItem) => t(`properties.kinds.${row.kind}`),
    },
    {
      id: "city",
      header: t("properties.city"),
      cell: (row: PropertyListItem) =>
        [row.city, row.district].filter(Boolean).join(" — ") || "—",
    },
    {
      id: "area",
      header: t("properties.landArea"),
      numeric: true,
      cell: (row: PropertyListItem) => (formatNumber(row.land_area)),
    },
    {
      id: "status",
      header: t("properties.status"),
      cell: (row: PropertyListItem) => (
        <Badge variant="secondary">{t(`properties.statuses.${row.status}`)}</Badge>
      ),
    },
    {
      id: "completion",
      header: t("properties.completion"),
      numeric: true,
      cell: (row: PropertyListItem) => `${row.completion_percent ?? 0}%`,
    },
  ];

  if (account.loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <CardsSkeleton cards={2} />
      </div>
    );
  }

  if (!entityId) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <SoftEmpty icon={Building2} message={t("shell.noAccessBody")} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={t("properties.title")}
        subtitle={t("properties.subtitle")}
        badge={<HeroBadge tone="neutral">{query.data?.length ?? 0}</HeroBadge>}
        aside={
          <Button asChild className="min-h-11" variant="secondary">
            <Link to="/properties/new">{t("properties.add")}</Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        getRowId={(row) => row.id}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle={t("properties.none")}
        emptyDescription={t("properties.noneDescription")}
        onRowClick={(row) =>
          navigate({ to: "/properties/$propertyId", params: { propertyId: row.id } })
        }
      />
    </div>
  );
}
