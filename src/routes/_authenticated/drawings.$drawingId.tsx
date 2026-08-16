import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCheck,
  Columns2,
  DraftingCompass,
  Eye,
  FileStack,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import {
  addDrawingMarkup,
  convertMarkupToRfi,
  enqueueDrawingConversion,
  getDrawing,
  getDrawingFileUrl,
  getDrawingsModuleStatus,
  resolveDrawingMarkup,
  setDrawingStatus,
} from "@/lib/drawings.functions";
import { VIEWER_TOOLS, capabilitiesFor } from "@/lib/drawings/providers";
import { buildAssistantReport } from "@/lib/drawings/review-assistant";
import { DISCIPLINE_KEYS, DRAWING_STATUS_KEYS, statusTone } from "./projects.$projectId.drawings";

export const Route = createFileRoute("/_authenticated/drawings/$drawingId")({
  component: DrawingViewerPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "عارض المخطط | ركيز" },
      {
        name: "description",
        content:
          "عرض نسخ المخطط الهندسي وملاحظاته وسجل اعتماده، مع روابط مؤقتة للملف الأصلي المحفوظ في تخزين خاص.",
      },
      { property: "og:title", content: "عارض المخطط | ركيز" },
      {
        property: "og:description",
        content: "كل نسخة محفوظة كما رُفعت، وكل تغيّر حالة مسجّل في سجل دائم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const NEXT_STATUSES: Record<string, { to: string; labelKey: string }[]> = {
  draft: [{ to: "under_review", labelKey: "drawings.toUnderReview" }],
  under_review: [
    { to: "approved_internal", labelKey: "drawings.toApprovedInternal" },
    { to: "returned", labelKey: "drawings.toReturned" },
  ],
  returned: [{ to: "under_review", labelKey: "drawings.toUnderReview" }],
  approved_internal: [
    { to: "issued_for_construction", labelKey: "drawings.toIssued" },
    { to: "superseded", labelKey: "drawings.toSuperseded" },
  ],
  issued_for_construction: [
    { to: "as_built", labelKey: "drawings.toAsBuilt" },
    { to: "superseded", labelKey: "drawings.toSuperseded" },
  ],
  as_built: [{ to: "superseded", labelKey: "drawings.toSuperseded" }],
  superseded: [],
};

const TOOL_LABEL_KEYS = {
  preview: "drawings.toolPreview",
  download: "drawings.toolDownload",
  sheets: "drawings.toolSheets",
  layers: "drawings.toolLayers",
  properties: "drawings.toolProperties",
  measure: "drawings.toolMeasure",
  markup: "drawings.toolMarkup",
} as const;


function DrawingViewerPage() {
  const { drawingId } = Route.useParams();
  const qc = useQueryClient();
  const t = useT();

  const fetchDrawing = useServerFn(getDrawing);
  const fetchStatus = useServerFn(getDrawingsModuleStatus);
  const fileUrl = useServerFn(getDrawingFileUrl);
  const changeStatus = useServerFn(setDrawingStatus);
  const enqueue = useServerFn(enqueueDrawingConversion);
  const addMarkup = useServerFn(addDrawingMarkup);
  const resolveMarkup = useServerFn(resolveDrawingMarkup);
  const makeRfi = useServerFn(convertMarkupToRfi);

  const query = useQuery({
    queryKey: ["drawing", drawingId],
    queryFn: () => fetchDrawing({ data: { drawingId } }),
  });
  const moduleStatus = useQuery({
    queryKey: ["drawings-module-status"],
    queryFn: () => fetchStatus({}),
  });

  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [compareUrls, setCompareUrls] = useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  const [rfiFor, setRfiFor] = useState<string | null>(null);
  const [rfiSubject, setRfiSubject] = useState("");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["drawing", drawingId] });

  const statusMutation = useMutation({
    mutationFn: (toStatus: string) =>
      changeStatus({
        data: { drawingId, toStatus: toStatus as "under_review", note: note.trim() || null },
      }),
    onSuccess: () => {
      setNote("");
      toast.success(t("drawings.statusChanged"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewMutation = useMutation({
    mutationFn: (versionId: string) => fileUrl({ data: { versionId } }),
    onSuccess: (result) => setPreview(result.url),
    onError: (error: Error) => toast.error(error.message),
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      if (!compareA || !compareB || compareA === compareB) {
        throw new Error(t("drawings.compareNeedTwo"));
      }
      const [a, b] = await Promise.all([
        fileUrl({ data: { versionId: compareA } }),
        fileUrl({ data: { versionId: compareB } }),
      ]);
      return { a: a.url, b: b.url };
    },
    onSuccess: (urls) => setCompareUrls(urls),
    onError: (error: Error) => toast.error(error.message),
  });

  const convertMutation = useMutation({
    mutationFn: (versionId: string) => enqueue({ data: { versionId } }),
    onSuccess: (result) => {
      toast.success(
        result.status === "disabled" ? t("drawings.providerApsDisabled") : t("drawings.jobQueued"),
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commentMutation = useMutation({
    mutationFn: (versionId: string) =>
      addMarkup({ data: { drawingId, versionId, body: comment.trim(), pageNo: 1 } }),
    onSuccess: () => {
      setComment("");
      toast.success(t("drawings.markupAdded"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveMutation = useMutation({
    mutationFn: (markupId: string) => resolveMarkup({ data: { markupId } }),
    onSuccess: () => {
      toast.success(t("drawings.resolved"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rfiMutation = useMutation({
    mutationFn: (input: { markupId: string; body: string }) =>
      makeRfi({
        data: {
          markupId: input.markupId,
          drawingId,
          subject: rfiSubject.trim(),
          body: input.body,
        },
      }),
    onSuccess: () => {
      setRfiFor(null);
      setRfiSubject("");
      toast.success(t("drawings.rfiCreated"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = query.data;
  const latest = data?.revisions[0] ?? null;
  const latestFile = data?.files.find((f) => f.id === latest?.document_version_id) ?? null;

  const capability = capabilitiesFor(
    latest?.format ?? "pdf",
    Boolean(moduleStatus.data?.apsReady),
  );

  const assistant = useMemo(() => {
    if (!data) return null;
    return buildAssistantReport({
      status: data.drawing.status,
      sheetNo: data.drawing.sheet_no,
      revisionLabel: latest?.revision_label ?? null,
      format: latest?.format ?? null,
      fileName: latest ? `${data.drawing.drawing_no}.${latest.format}` : null,
      sizeBytes: latestFile?.sizeBytes ?? null,
      checksum: latestFile?.checksum ?? null,
      sheetCount: null,
      scanNotes: {},
      hasIfcRevision: data.revisions.some((r) => r.format === "ifc"),
      revisionCount: data.revisions.length,
    });
  }, [data, latest, latestFile]);

  if (query.isPending) return <CardsSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title={t("drawings.viewerLoadError")}
        description={t("drawings.viewerLoadErrorBody")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!data) {
    return <ErrorState title={t("drawings.notFound")} description={t("drawings.notFoundBody")} />;
  }

  const { drawing, revisions, events, markups, jobs, files, linkedRequests } = data;
  const fileById = new Map(files.map((f) => [f.id, f]));
  const requestById = new Map(linkedRequests.map((r) => [r.id, r]));
  const revA = revisions.find((r) => r.document_version_id === compareA) ?? null;
  const revB = revisions.find((r) => r.document_version_id === compareB) ?? null;
  const fileA = compareA ? (fileById.get(compareA) ?? null) : null;
  const fileB = compareB ? (fileById.get(compareB) ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHero
        title={`${drawing.drawing_no} — ${drawing.title}`}
        subtitle={`${t(DISCIPLINE_KEYS[drawing.discipline] ?? "drawings.discOther")}${
          drawing.sheet_no ? ` · ${t("drawings.sheetLabel")} ${drawing.sheet_no}` : ""
        }`}
        badge={
          <HeroBadge tone={statusTone(drawing.status)}>
            {t(DRAWING_STATUS_KEYS[drawing.status] ?? "drawings.statusDraft")}
          </HeroBadge>
        }
      />

      <Link
        to="/projects/$projectId/drawings"
        params={{ projectId: drawing.project_id }}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
      >
        {t("drawings.backToProject")}
      </Link>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Eye} title={t("drawings.preview")}>
          {latest ? (
            <div className="space-y-3">
              {capability.availability !== "available" ? (
                <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  {t(capability.reasonKey ?? "drawings.providerApsDisabled")}
                </p>
              ) : null}
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => previewMutation.mutate(latest.document_version_id)}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? t("drawings.preparing") : t("drawings.openLatest")}
              </Button>
              {preview && capability.tools.preview ? (
                <iframe
                  src={preview}
                  title={t("drawings.preview")}
                  className="h-[480px] w-full rounded-xl border border-border"
                />
              ) : preview ? (
                <a
                  href={preview}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("drawings.downloadOriginal")}
                </a>
              ) : null}
              {latest.format !== "pdf" ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => convertMutation.mutate(latest.document_version_id)}
                  disabled={convertMutation.isPending}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {t("drawings.prepareViewer")}
                </Button>
              ) : null}
            </div>
          ) : (
            <SoftEmpty icon={DraftingCompass} message={t("drawings.noRevisionsHint")} />
          )}
        </SectionCard>

        <SectionCard icon={Wrench} title={t("drawings.tools")}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {VIEWER_TOOLS.map((tool) => (
              <li
                key={tool}
                className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="text-foreground">{t(TOOL_LABEL_KEYS[tool])}</span>
                <HeroBadge tone={capability.tools[tool] ? "success" : "neutral"}>
                  {capability.tools[tool] ? t("drawings.available") : t("drawings.unavailable")}
                </HeroBadge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {capability.provider === "native_pdf"
              ? t("drawings.providerNative")
              : capability.provider === "aps"
                ? t("drawings.providerAps")
                : t("drawings.providerLocalCad")}
            {capability.reasonKey ? ` · ${t(capability.reasonKey)}` : ""}
          </p>
        </SectionCard>

        <SectionCard icon={FileStack} title={t("drawings.revisions")} count={revisions.length}>
          {revisions.length === 0 ? (
            <SoftEmpty icon={FileStack} message={t("drawings.noRevisions")} />
          ) : (
            <ul className="divide-y divide-border/60">
              {revisions.map((rev) => {
                const meta = fileById.get(rev.document_version_id);
                return (
                  <li key={rev.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {rev.revision_label} · <span dir="ltr">{rev.format.toUpperCase()}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(rev.created_at)}
                        {meta?.sizeBytes
                          ? ` · ${Math.round(meta.sizeBytes / 1024)} ${t("drawings.size")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => previewMutation.mutate(rev.document_version_id)}
                    >
                      {t("drawings.open")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={Columns2} title={t("drawings.compare")}>
          {revisions.length < 2 ? (
            <SoftEmpty icon={Columns2} message={t("drawings.compareNeedTwo")} />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("drawings.compareHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cmp-a">{t("drawings.compareA")}</Label>
                  <select
                    id="cmp-a"
                    value={compareA}
                    onChange={(e) => setCompareA(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {revisions.map((r) => (
                      <option key={r.id} value={r.document_version_id}>
                        {r.revision_label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmp-b">{t("drawings.compareB")}</Label>
                  <select
                    id="cmp-b"
                    value={compareB}
                    onChange={(e) => setCompareB(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {revisions.map((r) => (
                      <option key={r.id} value={r.document_version_id}>
                        {r.revision_label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => compareMutation.mutate()}
                disabled={compareMutation.isPending || !compareA || !compareB || compareA === compareB}
              >
                {compareMutation.isPending ? t("drawings.preparing") : t("drawings.compareRun")}
              </Button>

              {revA && revB ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { rev: revA, file: fileA },
                    { rev: revB, file: fileB },
                  ].map(({ rev, file }) => (
                    <FieldGrid key={rev.id}>
                      <Field label={t("drawings.assistRevision")} value={rev.revision_label} />
                      <Field label={t("drawings.format")} value={rev.format.toUpperCase()} />
                      <Field label={t("drawings.createdAt")} value={formatDateTime(rev.created_at)} />
                      <Field
                        label={t("drawings.size")}
                        value={file?.sizeBytes ? String(Math.round(file.sizeBytes / 1024)) : t("drawings.notAvailable")}
                      />
                      <Field
                        label={t("drawings.checksum")}
                        value={file?.checksum ? file.checksum.slice(0, 16) : t("drawings.notAvailable")}
                      />
                    </FieldGrid>
                  ))}
                </div>
              ) : null}

              {revA && revB && fileA?.checksum && fileB?.checksum ? (
                <p className="text-xs text-muted-foreground">
                  {fileA.checksum === fileB.checksum
                    ? t("drawings.compareSame")
                    : t("drawings.compareDiff")}
                </p>
              ) : null}

              {compareUrls.a && compareUrls.b && revA?.format === "pdf" && revB?.format === "pdf" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <iframe
                    src={compareUrls.a}
                    title={t("drawings.compareA")}
                    className="h-[420px] w-full rounded-xl border border-border"
                  />
                  <iframe
                    src={compareUrls.b}
                    title={t("drawings.compareB")}
                    className="h-[420px] w-full rounded-xl border border-border"
                  />
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={CheckCheck} title={t("drawings.statusSection")}>
          <FieldGrid>
            <Field
              label={t("drawings.currentStatus")}
              value={t(DRAWING_STATUS_KEYS[drawing.status] ?? "drawings.statusDraft")}
            />
            <Field label={t("drawings.lastUpdate")} value={formatDateTime(drawing.updated_at)} />
          </FieldGrid>
          <div className="mt-3 space-y-2">
            <Label htmlFor="status-note">{t("drawings.note")}</Label>
            <Input id="status-note" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {(NEXT_STATUSES[drawing.status] ?? []).map((next) => (
                <Button
                  key={next.to}
                  variant="outline"
                  className="min-h-11"
                  onClick={() => statusMutation.mutate(next.to)}
                  disabled={statusMutation.isPending}
                >
                  {t(next.labelKey)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("drawings.sodNote")}</p>
          </div>

          <ul className="mt-4 space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">
                  {t(DRAWING_STATUS_KEYS[event.to_status] ?? "drawings.statusDraft")}
                </span>{" "}
                · {formatDateTime(event.created_at)}
                {event.note ? <span className="block text-muted-foreground">{event.note}</span> : null}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={Sparkles} title={t("drawings.assistant")}>
          {assistant ? (
            <div className="space-y-3">
              <FieldGrid>
                {assistant.facts.map((f) => (
                  <Field
                    key={f.labelKey}
                    label={`${t(f.labelKey)} · ${t(f.sourceKey)}`}
                    value={f.value ?? t("drawings.notAvailable")}
                  />
                ))}
              </FieldGrid>
              <p className="text-xs text-muted-foreground">
                {t("drawings.confidence")}:{" "}
                {assistant.overallConfidence === "high"
                  ? t("drawings.confidenceHigh")
                  : assistant.overallConfidence === "medium"
                    ? t("drawings.confidenceMedium")
                    : t("drawings.confidenceLow")}
              </p>
              <div>
                <p className="text-sm font-medium text-foreground">{t("drawings.findings")}</p>
                {assistant.findings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("drawings.noFindings")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {assistant.findings.map((f) => (
                      <li
                        key={f.code}
                        className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-foreground"
                      >
                        <HeroBadge tone={f.severity === "warning" ? "warning" : "neutral"}>
                          {f.severity === "warning" ? "!" : "i"}
                        </HeroBadge>{" "}
                        {t(f.messageKey)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t(assistant.disclaimerKey)}</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard icon={MessageSquare} title={t("drawings.markups")} count={markups.length}>
          {latest ? (
            <div className="space-y-2">
              <Label htmlFor="markup-body">{t("drawings.markupLabel")}</Label>
              <Textarea
                id="markup-body"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <Button
                className="min-h-11"
                onClick={() => commentMutation.mutate(latest.document_version_id)}
                disabled={commentMutation.isPending || comment.trim().length < 2}
              >
                {commentMutation.isPending ? t("drawings.adding") : t("drawings.addMarkup")}
              </Button>
            </div>
          ) : null}

          {markups.length === 0 ? (
            <SoftEmpty icon={MessageSquare} message={t("drawings.noMarkups")} />
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {markups.map((markup) => {
                const linked = markup.request_id ? requestById.get(markup.request_id) : null;
                return (
                  <li key={markup.id} className="space-y-2 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{markup.body}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(markup.created_at)}
                          {markup.resolved_at ? ` · ${t("drawings.resolved")}` : ""}
                        </p>
                        {linked ? (
                          <Link
                            to="/requests/$requestId"
                            params={{ requestId: linked.id }}
                            className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
                          >
                            {t("drawings.linkedRfi")}:{" "}
                            <span dir="ltr" className="font-mono">
                              {linked.requestNo ?? ""}
                            </span>
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!markup.request_id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            onClick={() => {
                              setRfiFor(rfiFor === markup.id ? null : markup.id);
                              setRfiSubject(`${drawing.drawing_no} — ${drawing.title}`);
                            }}
                          >
                            {t("drawings.rfiConvert")}
                          </Button>
                        ) : null}
                        {!markup.resolved_at ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            onClick={() => resolveMutation.mutate(markup.id)}
                          >
                            {t("drawings.resolve")}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {rfiFor === markup.id ? (
                      <div className="space-y-2 rounded-xl bg-secondary/50 p-3">
                        <Label htmlFor={`rfi-${markup.id}`}>{t("drawings.rfiSubject")}</Label>
                        <Input
                          id={`rfi-${markup.id}`}
                          value={rfiSubject}
                          onChange={(e) => setRfiSubject(e.target.value)}
                        />
                        <Button
                          className="min-h-11"
                          onClick={() =>
                            rfiMutation.mutate({ markupId: markup.id, body: markup.body })
                          }
                          disabled={rfiMutation.isPending || rfiSubject.trim().length < 3}
                        >
                          {rfiMutation.isPending ? t("drawings.adding") : t("drawings.rfiCreate")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {jobs.length ? (
        <SectionCard icon={RefreshCw} title={t("drawings.jobs")} count={jobs.length}>
          <ul className="divide-y divide-border/60">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-foreground">
                  {job.provider === "aps" ? t("drawings.providerAps") : t("drawings.providerLocalCad")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {job.status === "disabled"
                    ? t("drawings.jobDisabled")
                    : job.status === "succeeded"
                      ? t("drawings.jobReady")
                      : job.status === "failed"
                        ? t("drawings.jobFailed")
                        : t("drawings.jobQueued")}{" "}
                  · {formatDateTime(job.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
