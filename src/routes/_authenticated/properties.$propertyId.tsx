import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, FileSearch, MapPinned } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CardsSkeleton,
  DataTable,
  EmptyState,
  ErrorState,
  FieldGrid,
  Field,
  HeroBadge,
  PageHero,
  RakeezAccordion,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { useT } from "@/i18n";
import { formatNumber } from "@/lib/format";
import { DeedVersionModal } from "@/components/properties/DeedVersionModal";
import { LicenseVersionModal } from "@/components/properties/LicenseVersionModal";
import {
  addPropertyOwner,
  getDocumentUrl,
  getPropertyProfile,
  linkPropertyToProject,
  listLinkableProjects,
  type PropertyProfile,
} from "@/lib/properties.functions";
import { getDocumentDownloadUrl } from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/properties/$propertyId")({
  component: PropertyProfilePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الملف العقاري | ركيز" },
      {
        name: "description",
        content: "ملف عقاري موحّد في ركيز: ملخص أعلى الصفحة وتفاصيل الملكية والصكوك والرخص والوحدات.",
      },
      { property: "og:title", content: "الملف العقاري | ركيز" },
      {
        property: "og:description",
        content: "ملف عقاري موحّد في ركيز: الملكية والصكوك والرخص والحدود والوحدات والمشاريع المرتبطة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PropertyProfilePage() {
  const t = useT();
  const { propertyId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchProfile = useServerFn(getPropertyProfile);
  const fetchProjects = useServerFn(listLinkableProjects);
  const addOwner = useServerFn(addPropertyOwner);
  const linkProject = useServerFn(linkPropertyToProject);
  const signUrl = useServerFn(getDocumentUrl);
  const signVersionUrl = useServerFn(getDocumentDownloadUrl);

  const query = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProfile({ data: { propertyId } }),
  });

  const projectsQuery = useQuery({
    queryKey: ["linkable-projects"],
    queryFn: () => fetchProjects(),
  });

  const [ownerName, setOwnerName] = React.useState("");
  const [ownerShare, setOwnerShare] = React.useState("");
  const [projectId, setProjectId] = React.useState("");

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });

  const ownerMutation = useMutation({
    mutationFn: (input: Parameters<typeof addPropertyOwner>[0]) => addOwner(input),
    onSuccess: () => {
      toast.success(t("properties.owners.added"));
      setOwnerName("");
      setOwnerShare("");
      invalidate();
    },
    // The 100% ceiling is enforced by a database trigger, never by this form.
    onError: () => toast.error(t("properties.owners.exceeds")),
  });

  const linkMutation = useMutation({
    mutationFn: (input: Parameters<typeof linkPropertyToProject>[0]) => linkProject(input),
    onSuccess: () => {
      toast.success(t("properties.links.linked"));
      setProjectId("");
      invalidate();
    },
    onError: () => toast.error(t("common.error")),
  });

  const openDocument = async (versionRow: { document_version_id?: string | null; file_path: string | null }) => {
    try {
      if (versionRow.document_version_id) {
        const { url } = await signVersionUrl({ data: { versionId: versionRow.document_version_id } });
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      // Legacy rows only: no document_version_id yet, fall back to the raw path.
      if (!versionRow.file_path) {
        toast.error(t("properties.documents.noFile"));
        return;
      }
      const { url } = await signUrl({ data: { path: versionRow.file_path } });
      if (!url) {
        toast.error(t("properties.documents.noFile"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    }
  };

  if (query.isLoading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6">
        <CardsSkeleton cards={4} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6">
        <SoftEmpty icon={Building2} message={t("properties.notFound")} />
      </div>
    );
  }

  const profile: PropertyProfile = query.data;
  const p = profile.property;
  const totalShare = profile.owners
    .filter((o) => !o.ends_on)
    .reduce((sum, o) => sum + Number(o.share_percent), 0);

  const ownersPanel = (
    <div className="space-y-4">
      <DataTable
        columns={[
          {
            id: "name",
            header: t("properties.owners.name"),
            cell: (row: PropertyProfile["owners"][number]) =>
              row.owner_name_text ?? row.owner_user_id ?? row.owner_entity_id ?? "—",
          },
          {
            id: "share",
            header: t("properties.owners.share"),
            numeric: true,
            cell: (row: PropertyProfile["owners"][number]) => `${row.share_percent}%`,
          },
          {
            id: "from",
            header: t("properties.owners.from"),
            cell: (row: PropertyProfile["owners"][number]) => row.starts_on,
          },
          {
            id: "to",
            header: t("properties.owners.to"),
            cell: (row: PropertyProfile["owners"][number]) => row.ends_on ?? "—",
          },
        ]}
        rows={profile.owners}
        getRowId={(row) => row.id}
        emptyTitle={t("properties.owners.none")}
      />
      <p className="text-sm text-muted-foreground">
        {t("properties.owners.total")}: <span className="font-medium text-foreground">{totalShare}%</span>
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const share = Number(ownerShare);
          if (ownerName.trim().length < 2 || !Number.isFinite(share) || share <= 0) return;
          ownerMutation.mutate({
            data: { propertyId, ownerNameText: ownerName.trim(), sharePercent: share },
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("properties.owners.name")}</span>
          <input
            className="min-h-11 rounded-md border border-input bg-background px-3"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("properties.owners.share")}</span>
          <input
            type="number"
            step="0.01"
            className="min-h-11 w-32 rounded-md border border-input bg-background px-3"
            value={ownerShare}
            onChange={(event) => setOwnerShare(event.target.value)}
          />
        </label>
        <Button type="submit" className="min-h-11" disabled={ownerMutation.isPending}>
          {ownerMutation.isPending ? t("common.loading") : t("properties.owners.add")}
        </Button>
      </form>
    </div>
  );

  const documentsPanel = (
    kind: "deed" | "license",
    docs: PropertyProfile["deeds"] | PropertyProfile["licenses"],
    numberOf: (d: any) => string | null,
    issuerOf: (d: any) => string | null,
    dateOf: (v: any) => string | null,
  ) => {
    const addModalFor = (head: any | null) =>
      kind === "deed" ? (
        <DeedVersionModal
          propertyId={propertyId}
          deed={head}
          trigger={
            <Button className="min-h-11" variant={head ? "outline" : "default"}>
              {head ? t("properties.deeds.addVersion") : t("properties.deeds.addDeed")}
            </Button>
          }
        />
      ) : (
        <LicenseVersionModal
          propertyId={propertyId}
          license={head}
          trigger={
            <Button className="min-h-11" variant={head ? "outline" : "default"}>
              {head ? t("properties.licenses.addVersion") : t("properties.licenses.addLicense")}
            </Button>
          }
        />
      );

    const analyzeButton = (
      <Button asChild variant="outline" className="min-h-11">
        <Link
          to="/documents/analyze"
          search={{ propertyId, target: kind === "deed" ? "deed" : "building_license" }}
        >
          <FileSearch className="me-2 size-4" />
          {t("properties.documents.analyzeFile")}
        </Link>
      </Button>
    );

    return docs.length === 0 ? (
      <div className="space-y-4">
        <SoftEmpty icon={Building2} message={t("properties.documents.none")} />
        <div className="flex flex-wrap justify-end gap-3">
          {analyzeButton}
          {addModalFor(null)}
        </div>
      </div>
    ) : (
      <div className="space-y-6">
        {docs.map((doc) => (
          <div key={doc.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {t("properties.documents.number")}: {numberOf(doc) ?? "—"} ·{" "}
                {t("properties.documents.issuer")}: {issuerOf(doc) ?? "—"}
              </p>
              <div className="flex flex-wrap gap-3">
                {analyzeButton}
                {addModalFor(doc)}
              </div>
            </div>
            <DataTable
              columns={[
                {
                  id: "version",
                  header: t("properties.documents.version"),
                  numeric: true,
                  cell: (v: any) => `v${v.version_no}`,
                },
                {
                  id: "date",
                  header: t("properties.documents.date"),
                  cell: (v: any) => dateOf(v) ?? "—",
                },
                {
                  id: "extra",
                  header: kind === "deed" ? t("properties.deeds.ownerSnapshot") : t("properties.licenses.scope"),
                  cell: (v: any) => (kind === "deed" ? v.owner_name_snapshot : v.scope_text) ?? "—",
                },
                {
                  id: "file",
                  header: "",
                  cell: (v: any) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      onClick={() => void openDocument(v)}
                    >
                      {t("properties.documents.open")}
                    </Button>
                  ),
                },
              ]}
              rows={doc.versions as any[]}
              getRowId={(v) => (v as { id: string }).id}
              emptyTitle={t("properties.documents.none")}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t("properties.documents.versionHint")}</p>
      </div>
    );
  };

  const items = [
    { value: "owners", title: t("properties.tabs.owners"), content: ownersPanel },
    {
      value: "deeds",
      title: t("properties.tabs.deeds"),
      content: documentsPanel(
        "deed",
        profile.deeds,
        (d) => d.deed_number,
        (d) => d.issuer,
        (v) => v.deed_date,
      ),
    },
    {
      value: "licenses",
      title: t("properties.tabs.licenses"),
      content: documentsPanel(
        "license",
        profile.licenses,
        (d) => d.license_number,
        (d) => d.authority,
        (v) => v.issued_on,
      ),
    },
    {
      value: "boundaries",
      title: t("properties.tabs.boundaries"),
      content: (
        <DataTable
          columns={[
            {
              id: "side",
              header: t("properties.boundaries.side"),
              cell: (row: PropertyProfile["boundaries"][number]) =>
                t(`properties.boundaries.sides.${row.side}`),
            },
            {
              id: "length",
              header: t("properties.boundaries.length"),
              numeric: true,
              cell: (row: PropertyProfile["boundaries"][number]) => row.length_m ?? "—",
            },
            {
              id: "neighbor",
              header: t("properties.boundaries.neighbor"),
              cell: (row: PropertyProfile["boundaries"][number]) => row.neighbor_text ?? "—",
            },
          ]}
          rows={profile.boundaries}
          getRowId={(row) => row.id}
          emptyTitle={t("properties.boundaries.none")}
        />
      ),
    },
    {
      value: "units",
      title: t("properties.tabs.units"),
      content: (
        <DataTable
          columns={[
            {
              id: "no",
              header: t("properties.units.no"),
              cell: (row: PropertyProfile["units"][number]) => row.unit_no,
            },
            {
              id: "type",
              header: t("properties.units.type"),
              cell: (row: PropertyProfile["units"][number]) => row.unit_type,
            },
            {
              id: "floor",
              header: t("properties.units.floor"),
              numeric: true,
              cell: (row: PropertyProfile["units"][number]) => row.floor_no ?? "—",
            },
            {
              id: "area",
              header: t("properties.units.area"),
              numeric: true,
              cell: (row: PropertyProfile["units"][number]) => row.area ?? "—",
            },
            {
              id: "rooms",
              header: t("properties.units.rooms"),
              numeric: true,
              cell: (row: PropertyProfile["units"][number]) => row.rooms ?? "—",
            },
          ]}
          rows={profile.units}
          getRowId={(row) => row.id}
          emptyTitle={t("properties.units.none")}
        />
      ),
    },
    {
      value: "services",
      title: t("properties.tabs.services"),
      content:
        profile.services.length === 0 ? (
          <EmptyState
            title={t("properties.services.none")}
            description={t("properties.services.soon")}
          />
        ) : (
          <DataTable
            columns={[
              {
                id: "type",
                header: t("properties.services.type"),
                cell: (row: PropertyProfile["services"][number]) => row.service_type,
              },
              {
                id: "status",
                header: t("properties.status"),
                cell: (row: PropertyProfile["services"][number]) => row.status,
              },
              {
                id: "ref",
                header: t("properties.services.reference"),
                cell: (row: PropertyProfile["services"][number]) => row.reference_no ?? "—",
              },
            ]}
            rows={profile.services}
            getRowId={(row) => row.id}
            emptyTitle={t("properties.services.none")}
          />
        ),
    },
    {
      value: "projects",
      title: t("properties.tabs.projects"),
      content: (
        <div className="space-y-4">
          <DataTable
            columns={[
              {
                id: "project",
                header: t("properties.links.project"),
                cell: (row: PropertyProfile["projects"][number]) => row.project_name ?? row.project_id,
              },
              {
                id: "relation",
                header: t("properties.links.relation"),
                cell: (row: PropertyProfile["projects"][number]) =>
                  t(`properties.links.${row.relation === "primary" ? "primary" : "related"}`),
              },
            ]}
            rows={profile.projects}
            getRowId={(row) => row.id}
            emptyTitle={t("properties.links.none")}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="min-h-11 w-64">
                <SelectValue placeholder={t("properties.links.project")} />
              </SelectTrigger>
              <SelectContent>
                {(projectsQuery.data ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-11"
              disabled={!projectId || linkMutation.isPending}
              onClick={() =>
                linkMutation.mutate({ data: { propertyId, projectId, relation: "related" } })
              }
            >
              {linkMutation.isPending ? t("common.loading") : t("properties.links.link")}
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={p.name}
        subtitle={[p.city, p.district].filter(Boolean).join(" / ") || undefined}
        badge={
          <>
            <HeroBadge tone="neutral">{t(`properties.kinds.${p.kind}`)}</HeroBadge>
            <HeroBadge tone="success">{t(`properties.statuses.${p.status}`)}</HeroBadge>
          </>
        }
      />

      <SectionCard icon={MapPinned} title={t("properties.completion")}>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("properties.completionHint")}</p>
          <div className="flex items-center gap-4">
            <Progress value={p.completion_percent ?? 0} className="h-2" />
            <span className="text-sm font-medium text-foreground">
              {p.completion_percent ?? 0}%
            </span>
          </div>
          <FieldGrid>
            <Field label={t("properties.city")} value={p.city ?? "—"} />
            <Field label={t("properties.district")} value={p.district ?? "—"} />
            <Field
              label={t("properties.landArea")}
              value={formatNumber(p.land_area)}
            />
            <Field label={t("properties.planNo")} value={p.plan_no ?? "—"} />
            <Field label={t("properties.parcelNo")} value={p.parcel_no ?? "—"} />
            <Field label={t("properties.region")} value={p.region ?? "—"} />
            <Field label={t("properties.address")} value={p.address ?? "—"} />
            <Field label={t("properties.frontage")} value={p.frontage ?? "—"} />
            <Field label={t("properties.streets")} value={p.streets ?? "—"} />
            <Field label={t("properties.landUse")} value={p.land_use ?? "—"} />
            <Field
              label={t("properties.approxLocation")}
              value={
                p.approx_lat != null && p.approx_lng != null
                  ? `${p.approx_lat}, ${p.approx_lng}`
                  : "—"
              }
            />
            <Field
              label={t("properties.exactLocation")}
              value={
                p.can_view_exact
                  ? (p.exact_address ??
                    (p.exact_lat != null ? `${p.exact_lat}, ${p.exact_lng}` : "—"))
                  : t("properties.exactHidden")
              }
            />
          </FieldGrid>
          {!p.can_view_exact ? (
            <p className="text-xs text-muted-foreground">{t("properties.exactHiddenHint")}</p>
          ) : null}
        </div>
      </SectionCard>

      {/* Details stay collapsed by default; the summary above is the default view. */}
      <RakeezAccordion items={items} multiple />
    </div>
  );
}
