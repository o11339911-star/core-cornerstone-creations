import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DraftingCompass, PlugZap, Ruler, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CardsSkeleton,
  ErrorState,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import {
  CAD_BUCKET,
  DRAWING_DISCIPLINES,
  DRAWING_FORMATS,
  createDrawing,
  getDrawingsModuleStatus,
  listProjectDrawings,
  startDrawingUpload,
} from "@/lib/drawings.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/projects/$projectId/drawings")({
  component: ProjectDrawingsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المخططات الهندسية | ركيز" },
      {
        name: "description",
        content:
          "إدارة مخططات المشروع الهندسية: نسخ غير قابلة للتعديل، مسار مراجعة واعتماد، وتخزين خاص لا يصل إليه إلا أصحاب الصلاحية.",
      },
      { property: "og:title", content: "المخططات الهندسية | ركيز" },
      {
        property: "og:description",
        content: "كل نسخة مخطط محفوظة كما رُفعت، ولا اعتماد إلا من غير رافع النسخة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export const DISCIPLINE_KEYS: Record<string, string> = {
  architectural: "drawings.discArchitectural",
  structural: "drawings.discStructural",
  mechanical: "drawings.discMechanical",
  electrical: "drawings.discElectrical",
  plumbing: "drawings.discPlumbing",
  civil: "drawings.discCivil",
  landscape: "drawings.discLandscape",
  survey: "drawings.discSurvey",
  other: "drawings.discOther",
};

export const DRAWING_STATUS_KEYS: Record<string, string> = {
  draft: "drawings.statusDraft",
  under_review: "drawings.statusUnderReview",
  returned: "drawings.statusReturned",
  approved_internal: "drawings.statusApprovedInternal",
  issued_for_construction: "drawings.statusIssued",
  as_built: "drawings.statusAsBuilt",
  superseded: "drawings.statusSuperseded",
};

export const APPROVED_STATUSES = [
  "approved_internal",
  "issued_for_construction",
  "as_built",
] as const;

export function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if ((APPROVED_STATUSES as readonly string[]).includes(status)) return "success";
  if (status === "returned") return "danger";
  if (status === "under_review") return "warning";
  return "neutral";
}

// ZIP غير مقبول: لا فحص محتوى موثوق للأرشيف، فلا نقبله بدل ادّعاء حمايته.
type AllowedExt = (typeof DRAWING_FORMATS)[number];

const MIME_BY_EXT: Record<AllowedExt, string> = {
  pdf: "application/pdf",
  dwg: "application/octet-stream",
  dxf: "application/octet-stream",
  ifc: "application/octet-stream",
};

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ProjectDrawingsPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const t = useT();

  const fetchDrawings = useServerFn(listProjectDrawings);
  const fetchStatus = useServerFn(getDrawingsModuleStatus);
  const create = useServerFn(createDrawing);
  const startUpload = useServerFn(startDrawingUpload);

  const drawings = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => fetchDrawings({ data: { projectId } }),
  });
  const moduleStatus = useQuery({
    queryKey: ["drawings-module-status"],
    queryFn: () => fetchStatus({}),
  });

  const [drawingNo, setDrawingNo] = useState("");
  const [title, setTitle] = useState("");
  const [sheetNo, setSheetNo] = useState("");
  const [discipline, setDiscipline] = useState<string>("architectural");
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [revisionLabel, setRevisionLabel] = useState("");
  const [supersedeReason, setSupersedeReason] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["drawings", projectId] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          projectId,
          drawingNo: drawingNo.trim(),
          discipline: discipline as (typeof DRAWING_DISCIPLINES)[number],
          title: title.trim(),
          sheetNo: sheetNo.trim() || null,
        },
      }),
    onSuccess: () => {
      setDrawingNo("");
      setTitle("");
      setSheetNo("");
      toast.success(t("drawings.created"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileInput.current?.files?.[0];
      if (!file || !uploadTarget) throw new Error(t("drawings.pickFile"));
      const ext = (file.name.split(".").pop() ?? "").toLowerCase() as AllowedExt;
      if (!(DRAWING_FORMATS as readonly string[]).includes(ext)) {
        throw new Error(t("drawings.formatsNote"));
      }
      if (!revisionLabel.trim()) throw new Error(t("drawings.needRevision"));
      const checksum = await sha256Hex(file);
      const slot = await startUpload({
        data: {
          drawingId: uploadTarget,
          fileExt: ext,
          mimeType: MIME_BY_EXT[ext],
          sizeBytes: file.size,
          checksumSha256: checksum,
          revisionLabel: revisionLabel.trim(),
          supersedeReason: supersedeReason.trim() || null,
        },
      });
      const uploaded = await supabase.storage
        .from(CAD_BUCKET)
        .uploadToSignedUrl(slot.path, slot.token, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      return slot;
    },
    onSuccess: () => {
      setRevisionLabel("");
      setSupersedeReason("");
      if (fileInput.current) fileInput.current.value = "";
      toast.success(t("drawings.uploaded"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (drawings.isPending) return <CardsSkeleton />;
  if (drawings.isError) {
    return (
      <ErrorState
        title={t("drawings.loadError")}
        description={t("drawings.loadErrorBody")}
        onRetry={() => void drawings.refetch()}
      />
    );
  }

  const rows = drawings.data;
  const approved = rows.filter((r) =>
    (APPROVED_STATUSES as readonly string[]).includes(r.status),
  ).length;
  const inReview = rows.filter((r) => r.status === "under_review").length;

  return (
    <div className="space-y-6">
      <PageHero
        title={t("drawings.title")}
        subtitle={t("drawings.subtitle")}
        badge={<HeroBadge tone="neutral">{t("drawings.badge")}</HeroBadge>}
      />

      <StatGrid>
        <StatCard
          icon={DraftingCompass}
          label={t("drawings.total")}
          value={rows.length}
          tone="primary"
        />
        <StatCard
          icon={ShieldCheck}
          label={t("drawings.approvedCount")}
          value={approved}
          tone="success"
        />
        <StatCard icon={Ruler} label={t("drawings.inReview")} value={inReview} tone="warning" />
        <StatCard
          icon={PlugZap}
          label={t("drawings.apsIntegration")}
          value={moduleStatus.data?.apsReady ? t("drawings.enabled") : t("drawings.disabled")}
          hint={
            moduleStatus.data?.apsReasonKey ? t(moduleStatus.data.apsReasonKey) : t("drawings.providerAps")
          }
          tone="info"
        />
      </StatGrid>

      <SectionCard icon={DraftingCompass} title={t("drawings.addDrawing")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="drawing-no">{t("drawings.drawingNo")}</Label>
            <Input
              id="drawing-no"
              value={drawingNo}
              onChange={(e) => setDrawingNo(e.target.value)}
              placeholder="A-101"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-title">{t("drawings.drawingTitle")}</Label>
            <Input id="drawing-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-discipline">{t("drawings.discipline")}</Label>
            <select
              id="drawing-discipline"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {DRAWING_DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {t(DISCIPLINE_KEYS[d] ?? "drawings.discOther")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-sheet">{t("drawings.sheetNoOptional")}</Label>
            <Input
              id="drawing-sheet"
              value={sheetNo}
              onChange={(e) => setSheetNo(e.target.value)}
              placeholder="1/12"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            className="min-h-11"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !drawingNo.trim() || title.trim().length < 2}
          >
            {createMutation.isPending ? t("drawings.creating") : t("drawings.create")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={Ruler} title={t("drawings.list")} count={rows.length}>
        {rows.length === 0 ? (
          <SoftEmpty icon={DraftingCompass} message={t("drawings.empty")} />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <li key={row.id} className="space-y-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/drawings/$drawingId"
                      params={{ drawingId: row.id }}
                      className="truncate text-sm font-semibold text-primary hover:underline"
                    >
                      <span dir="ltr" className="font-mono">
                        {row.drawing_no}
                      </span>{" "}
                      — {row.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t(DISCIPLINE_KEYS[row.discipline] ?? "drawings.discOther")}
                      {row.sheet_no ? ` · ${t("drawings.sheetLabel")} ${row.sheet_no}` : ""} ·{" "}
                      {formatDateTime(row.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <HeroBadge tone={statusTone(row.status)}>
                      {t(DRAWING_STATUS_KEYS[row.status] ?? "drawings.statusDraft")}
                    </HeroBadge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setUploadTarget(uploadTarget === row.id ? null : row.id)}
                    >
                      <Upload className="size-4" aria-hidden="true" />
                      {t("drawings.uploadRevision")}
                    </Button>
                  </div>
                </div>

                {uploadTarget === row.id ? (
                  <div className="grid gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`rev-${row.id}`}>{t("drawings.revisionLabel")}</Label>
                      <Input
                        id={`rev-${row.id}`}
                        value={revisionLabel}
                        onChange={(e) => setRevisionLabel(e.target.value)}
                        placeholder="Rev-A"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`reason-${row.id}`}>{t("drawings.supersedeReason")}</Label>
                      <Input
                        id={`reason-${row.id}`}
                        value={supersedeReason}
                        onChange={(e) => setSupersedeReason(e.target.value)}
                        placeholder={t("drawings.supersedeHint")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`file-${row.id}`}>{t("drawings.file")}</Label>
                      <Input
                        id={`file-${row.id}`}
                        ref={fileInput}
                        type="file"
                        accept=".pdf,.dwg,.dxf,.ifc"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Button
                        className="min-h-11"
                        onClick={() => uploadMutation.mutate()}
                        disabled={uploadMutation.isPending}
                      >
                        {uploadMutation.isPending ? t("drawings.uploading") : t("drawings.upload")}
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">{t("drawings.sizeNote")}</p>
                      <p className="text-xs text-muted-foreground">{t("drawings.formatsNote")}</p>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
