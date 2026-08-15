import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, ErrorState } from "@/components/rakeez";
import { useT } from "@/i18n";
import { listProperties, type PropertyListItem } from "@/lib/properties.functions";

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

  const query = useQuery({
    queryKey: ["properties"],
    queryFn: () => fetchProperties(),
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
      cell: (row: PropertyListItem) => (row.land_area ? row.land_area.toLocaleString("en-US") : "—"),
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

  return (
    <div className="bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-start">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("properties.title")}
            </h1>
            <p className="mt-2 text-muted-foreground">{t("properties.subtitle")}</p>
          </div>
          <Button asChild className="min-h-11">
            <Link to="/properties/new">{t("properties.add")}</Link>
          </Button>
        </header>

        <div className="mt-8">
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
      </div>
    </div>
  );
}
