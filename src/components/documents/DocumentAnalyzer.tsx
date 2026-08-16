import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSearch,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHero, SectionCard, SoftEmpty, CardsSkeleton } from "@/components/rakeez";
import { TextField, TextAreaField } from "@/components/rakeez/form-field";
import { normalizedInput } from "@/components/rakeez/numeric";
import { useT } from "@/i18n";
import { toLatinDigits } from "@/lib/format";
import { useActiveAccount } from "@/lib/active-account";
import { listProperties, getPropertyProfile } from "@/lib/properties.functions";
import {
  createDocument,
  getDocument,
  getDocumentDownloadUrl,
  linkDocument,
  listDocumentCategories,
  listDocuments,
  reserveDocumentVersion,
} from "@/lib/documents.functions";
import {
  abortUpload,
  completeAnalysis,
  confirmAnalysis,
  rejectAnalysis,
  startAnalysis,
  type AnalysisTarget,
} from "@/lib/analysis.functions";
import {
  analyzeFile,
  ocrAvailable,
  type ExtractedFieldKey,
  type ExtractionResult,
} from "@/lib/analysis/extract";
import { normalizeArea, normalizeDateInput } from "@/lib/analysis/normalize";

const FIELD_ORDER: ExtractedFieldKey[] = [
  "number",
  "issuer",
  "issue_date",
  "expiry_date",
  "owner",
  "area",
  "plan_no",
  "parcel_no",
  "city",
  "district",
  "land_use",
  "restrictions",
  "office",
];

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Upload → automatic analysis → explicit approval. Nothing reaches the
 * property before `confirm_document_analysis` succeeds server-side. */
type AnalysisState = "idle" | "uploading" | "uploaded" | "analyzing" | "completed" | "failed";

type Uploaded = { documentId: string; versionId: string; fileName: string };

export function DocumentAnalyzer({
  initialPropertyId,
  initialTarget,
}: {
  initialPropertyId?: string | undefined;
  initialTarget?: AnalysisTarget | undefined;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { scope } = useActiveAccount();

  const fetchProperties = useServerFn(listProperties);
  const fetchProfile = useServerFn(getPropertyProfile);
  const fetchCategories = useServerFn(listDocumentCategories);
  const fetchDocuments = useServerFn(listDocuments);
  const fetchDocument = useServerFn(getDocument);
  const download = useServerFn(getDocumentDownloadUrl);
  const createDoc = useServerFn(createDocument);
  const reserveVersion = useServerFn(reserveDocumentVersion);
  const link = useServerFn(linkDocument);
  const start = useServerFn(startAnalysis);
  const complete = useServerFn(completeAnalysis);
  const confirm = useServerFn(confirmAnalysis);
  const reject = useServerFn(rejectAnalysis);
  const abort = useServerFn(abortUpload);

  const entityId = scope?.kind === "entity" ? scope.entityId : null;

  const [propertyId, setPropertyId] = React.useState(initialPropertyId ?? "");
  const [categoryCode, setCategoryCode] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<AnalysisState>("idle");
  const [uploaded, setUploaded] = React.useState<Uploaded | null>(null);
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [attemptNo, setAttemptNo] = React.useState(1);
  const [failureReason, setFailureReason] = React.useState<string | null>(null);
  const [duplicate, setDuplicate] = React.useState<{ versionId: string } | null>(null);
  const [extraction, setExtraction] = React.useState<ExtractionResult | null>(null);
  const [originalFields, setOriginalFields] = React.useState<Record<string, string>>({});
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [target, setTarget] = React.useState<AnalysisTarget>(initialTarget ?? "deed");
  const [headId, setHeadId] = React.useState<string>("");
  const [rejectReason, setRejectReason] = React.useState("");
  const [numberError, setNumberError] = React.useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState(false);

  const propertiesQuery = useQuery({
    queryKey: ["analysis-properties", entityId],
    queryFn: () => fetchProperties({ data: { entityId: entityId as string } }),
    enabled: Boolean(entityId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["doc-categories"],
    queryFn: () => fetchCategories(),
  });
  const profileQuery = useQuery({
    queryKey: ["analysis-profile", propertyId],
    queryFn: () => fetchProfile({ data: { propertyId } }),
    enabled: Boolean(propertyId),
  });

  const activeCategory = (categoriesQuery.data ?? []).find((c) => c.code === categoryCode);
  const heads =
    target === "deed" ? (profileQuery.data?.deeds ?? []) : (profileQuery.data?.licenses ?? []);

  const resetPipeline = () => {
    setFile(null);
    setState("idle");
    setUploaded(null);
    setAnalysisId(null);
    setAttemptNo(1);
    setFailureReason(null);
    setDuplicate(null);
    setExtraction(null);
    setOriginalFields({});
    setFields({});
    setHeadId("");
    setNumberError(undefined);
    setFieldErrors({});
    setConfirmed(false);
  };

  /** Runs the local extraction against an already-open (processing) job. */
  const runAnalysis = React.useCallback(
    async (versionId: string, retry: boolean, sourceFile: File) => {
      setState("analyzing");
      setFailureReason(null);
      const { analysisId: id } = await start({ data: { documentVersionId: versionId, retry } });
      setAnalysisId(id);
      if (retry) setAttemptNo((n) => n + 1);

      const result = await analyzeFile(sourceFile);
      setExtraction(result);

      const nextFields: Record<string, string> = {};
      for (const key of FIELD_ORDER) {
        const value = result.fields[key];
        if (value) nextFields[key] = value;
      }

      const { status } = await complete({
        data: {
          analysisId: id,
          engine: result.engine === "pdf_text" ? "pdf_text" : "manual",
          status: result.ok ? "review_required" : "failed",
          detectedType: result.detectedType,
          extractedFields: nextFields,
          fieldConfidence: result.confidence,
          conflicts: result.conflicts,
          failureReason: result.failureReason ?? null,
        },
      });

      if (status === "review_required") {
        setOriginalFields(nextFields);
        setFields(nextFields);
        if (result.detectedType === "building_license") setTarget("building_license");
        else if (result.detectedType === "deed") setTarget("deed");
        setState("completed");
      } else {
        setFailureReason(result.failureReason ?? t("analysis.stateFailed"));
        setState("failed");
      }
    },
    [complete, start, t],
  );

  /** Upload first; analysis starts automatically right after, exactly once. */
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("common.required"));
      if (!propertyId) throw new Error(t("analysis.pickProperty"));
      if (!categoryCode) throw new Error(t("analysis.pickCategory"));
      if (activeCategory) {
        const allowed = (activeCategory.allowed_mime as string[] | null) ?? null;
        if (allowed && allowed.length > 0 && file.type && !allowed.includes(file.type)) {
          throw new Error(t("analysis.invalidType"));
        }
        const maxBytes = (activeCategory.max_size_mb ?? 0) * 1024 * 1024;
        if (maxBytes > 0 && file.size > maxBytes) {
          throw new Error(t("analysis.tooLarge"));
        }
      }

      setState("uploading");
      const checksum = await sha256Hex(file);

      // Duplicate guard — a failing document read must not block the upload.
      const docs = await fetchDocuments({
        data: { contextType: "property", contextId: propertyId },
      }).catch(() => []);
      for (const doc of docs) {
        const detail = await fetchDocument({ data: { documentId: doc.id } }).catch(() => null);
        const match = detail?.versions.find((v) => v.checksum_sha256 === checksum);
        if (match) {
          setDuplicate({ versionId: match.id });
          throw new Error(t("analysis.duplicateFound"));
        }
      }

      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const { documentId } = await createDoc({
        data: {
          ownerEntityId: entityId as string,
          categoryCode,
          title: `${categoryCode}-${file.name}`.slice(0, 200),
          visibility: "entity_private",
        },
      });
      const reserved = await reserveVersion({
        data: {
          documentId,
          fileExt: ext,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256: checksum,
        },
      });

      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const upload = await supabase.storage
          .from(reserved.storage_bucket)
          .upload(reserved.storage_path, file, ...(file.type ? [{ contentType: file.type }] : []));
        if (upload.error) throw new Error(upload.error.message);
        await link({ data: { documentId, contextType: "property", contextId: propertyId } });
      } catch (uploadError) {
        await abort({
          data: {
            versionId: reserved.version_id,
            reason: uploadError instanceof Error ? uploadError.message : "upload failed",
          },
        }).catch(() => undefined);
        throw new Error(t("analysis.uploadFailed"));
      }

      setUploaded({ documentId, versionId: reserved.version_id, fileName: file.name });
      setState("uploaded");
      return { versionId: reserved.version_id };
    },
    onSuccess: async ({ versionId }) => {
      if (!file) return;
      try {
        await runAnalysis(versionId, false, file);
      } catch (error) {
        setFailureReason(error instanceof Error ? error.message : t("analysis.stateFailed"));
        setState("failed");
      }
    },
    onError: (error: unknown) => {
      setState("idle");
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!uploaded || !file) throw new Error(t("common.error"));
      await runAnalysis(uploaded.versionId, true, file);
    },
    onError: (error: unknown) => {
      setFailureReason(error instanceof Error ? error.message : t("analysis.stateFailed"));
      setState("failed");
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!analysisId || state !== "completed") throw new Error(t("analysis.lockedHint"));
      const number = toLatinDigits((fields["number"] ?? "").trim());
      if (!/^[0-9A-Za-z/-]{1,60}$/.test(number)) {
        setNumberError(t("analysis.numberRequired"));
        throw new Error(t("analysis.numberRequired"));
      }
      setNumberError(undefined);

      const issue = normalizeDateInput(fields["issue_date"]);
      const expiry = normalizeDateInput(fields["expiry_date"]);
      const nextErrors: Record<string, string> = {};
      if (issue && !issue.ok) nextErrors["issue_date"] = t("analysis.invalidDate");
      if (expiry && !expiry.ok) nextErrors["expiry_date"] = t("analysis.invalidDate");

      const areaRaw = (fields["area"] ?? "").trim();
      const area = normalizeArea(areaRaw);
      if (areaRaw && area === null) nextErrors["area"] = t("analysis.invalidArea");

      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        throw new Error(Object.values(nextErrors)[0] as string);
      }

      return confirm({
        data: {
          analysisId,
          propertyId,
          target,
          headId: headId || null,
          number,
          issuer: fields["issuer"] ?? null,
          date1: issue?.ok ? issue.iso : null,
          date2: expiry?.ok ? expiry.iso : null,
          area,
          ownerSnapshot: fields["owner"] ?? null,
          scopeText: fields["restrictions"] ?? null,
          correctedFields: fields,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("analysis.applied"));
      setConfirmed(true);
      void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : t("common.error")),
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!analysisId) throw new Error(t("common.error"));
      return reject({ data: { analysisId, reason: rejectReason.trim() || "رفض من المستخدم" } });
    },
    onSuccess: () => {
      toast.success(t("analysis.rejected"));
      resetPipeline();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : t("common.error")),
  });

  if (!entityId) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageHero title={t("analysis.title")} subtitle={t("analysis.subtitle")} />
        <SoftEmpty icon={Building2} message={t("analysis.selectEntityFirst")} />
      </div>
    );
  }

  const busy = state === "uploading" || state === "analyzing";

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("analysis.title")} subtitle={t("analysis.subtitle")} />

      {confirmed ? (
        <SectionCard icon={CheckCircle2} title={t("analysis.applied")}>
          <div className="flex flex-wrap gap-3">
            <Button className="min-h-11" onClick={resetPipeline}>
              {t("analysis.startOver")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => navigate({ to: "/properties/$propertyId", params: { propertyId } })}
            >
              {t("analysis.goToProperty")}
            </Button>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard icon={UploadCloud} title={t("analysis.title")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("analysis.pickProperty")}</Label>
                {propertiesQuery.isLoading ? (
                  <CardsSkeleton cards={1} />
                ) : (propertiesQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("analysis.noProperties")}</p>
                ) : (
                  <Select
                    value={propertyId}
                    onValueChange={setPropertyId}
                    disabled={Boolean(uploaded)}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue placeholder={t("analysis.pickProperty")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(propertiesQuery.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("analysis.pickTarget")}</Label>
                <Select value={target} onValueChange={(v) => setTarget(v as AnalysisTarget)}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deed">{t("analysis.targetDeed")}</SelectItem>
                    <SelectItem value="building_license">{t("analysis.targetLicense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("analysis.pickCategory")}</Label>
                <Select
                  value={categoryCode}
                  onValueChange={setCategoryCode}
                  disabled={Boolean(uploaded)}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder={t("analysis.pickCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoriesQuery.data ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="analysis-file">{t("analysis.pickFile")}</Label>
                {uploaded ? (
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("analysis.uploadedFile")}: </span>
                    {uploaded.fileName}
                  </p>
                ) : (
                  <Input
                    id="analysis-file"
                    type="file"
                    className="min-h-11"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                )}
                {!ocrAvailable && file && file.type.startsWith("image/") ? (
                  <p className="text-xs font-medium text-warning">{t("analysis.ocrUnavailable")}</p>
                ) : null}
              </div>

              {duplicate ? (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:col-span-2">
                  <p className="mb-2 font-medium">{t("analysis.duplicateFound")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { url } = await download({ data: { versionId: duplicate.versionId } });
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    {t("analysis.openDuplicate")}
                  </Button>
                </div>
              ) : null}
            </div>

            {!uploaded ? (
              <Button
                className="mt-4 min-h-11"
                onClick={() => {
                  setDuplicate(null);
                  uploadMutation.mutate();
                }}
                disabled={busy || !file || !propertyId || !categoryCode}
              >
                {state === "uploading" ? t("analysis.uploading") : t("analysis.uploadAndAnalyze")}
              </Button>
            ) : null}
          </SectionCard>

          {uploaded ? (
            <SectionCard icon={FileSearch} title={t("analysis.reviewTitle")}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <StatusPill state={state} t={t} />
                <span className="text-xs text-muted-foreground">
                  {t("analysis.attempt")} <span dir="ltr">{attemptNo}</span>
                </span>
                {state === "completed" || state === "failed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending || busy}
                  >
                    <RefreshCw className="me-2 size-4" />
                    {t("analysis.retry")}
                  </Button>
                ) : null}
              </div>

              {state === "analyzing" || state === "uploaded" ? <CardsSkeleton cards={1} /> : null}

              {state === "failed" ? (
                <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                  <p className="font-medium">{failureReason ?? t("analysis.stateFailed")}</p>
                  <p className="text-xs text-muted-foreground">{t("analysis.failedHint")}</p>
                </div>
              ) : null}

              {state === "completed" ? (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">{t("analysis.reviewHint")}</p>

                  {heads.length > 0 ? (
                    <div className="mb-4 space-y-2">
                      <Label>{t("analysis.pickHead")}</Label>
                      <Select
                        value={headId || "__new__"}
                        onValueChange={(v) => setHeadId(v === "__new__" ? "" : v)}
                      >
                        <SelectTrigger className="min-h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new__">{t("analysis.newHead")}</SelectItem>
                          {heads.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {("deed_number" in h ? h.deed_number : h.license_number) ?? "—"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {FIELD_ORDER.map((key) => {
                      const conflict = extraction?.conflicts.find((c) => c.field === key);
                      const raw = extraction?.confidence[key];
                      const confidencePct = raw ? Math.round(raw * 100) : null;
                      const isRequired = key === "number";
                      const changed = (fields[key] ?? "") !== (originalFields[key] ?? "");
                      return (
                        <div key={key}>
                          {isRequired ? (
                            <TextField
                              id={`field-${key}`}
                              label={t(`analysis.field${toPascal(key)}` as never)}
                              required
                              error={numberError}
                              {...normalizedInput(fields[key] ?? "", (v) => {
                                setNumberError(undefined);
                                setFields((prev) => ({ ...prev, [key]: v }));
                              })}
                            />
                          ) : (
                            <TextField
                              id={`field-${key}`}
                              label={t(`analysis.field${toPascal(key)}` as never)}
                              value={fields[key] ?? ""}
                              {...(fieldErrors[key] ? { error: fieldErrors[key] } : {})}
                              onChange={(e) => {
                                const value = e.target.value;
                                setFieldErrors((prev) => {
                                  if (!prev[key]) return prev;
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                                setFields((prev) => ({ ...prev, [key]: value }));
                              }}
                            />
                          )}
                          <div className="mt-1 flex flex-wrap gap-3">
                            {confidencePct !== null ? (
                              <span className="text-xs text-muted-foreground">
                                {t("analysis.confidence")}: <span dir="ltr">{confidencePct}%</span>
                              </span>
                            ) : null}
                            {changed && originalFields[key] ? (
                              <span className="text-xs text-muted-foreground">
                                {originalFields[key]}
                              </span>
                            ) : null}
                            {conflict ? (
                              <span className="text-xs font-medium text-warning">
                                {t("analysis.conflict")}: {conflict.values.join(" / ")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 space-y-3 border-t border-border pt-4">
                    <TextAreaField
                      id="reject-reason"
                      label={t("analysis.rejectReason")}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex flex-wrap justify-end gap-3">
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => rejectMutation.mutate()}
                        disabled={rejectMutation.isPending}
                      >
                        {t("analysis.rejectConfirm")}
                      </Button>
                      <Button
                        className="min-h-11"
                        onClick={() => confirmMutation.mutate()}
                        disabled={confirmMutation.isPending}
                      >
                        {t("analysis.confirmAndContinue")}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{t("analysis.lockedHint")}</p>
              )}
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusPill({
  state,
  t,
}: {
  state: AnalysisState;
  t: (key: never) => string;
}) {
  const map: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    uploading: {
      label: t("analysis.uploading" as never),
      className: "bg-muted text-muted-foreground",
      icon: Loader2,
    },
    uploaded: {
      label: t("analysis.stateUploaded" as never),
      className: "bg-muted text-muted-foreground",
      icon: UploadCloud,
    },
    analyzing: {
      label: t("analysis.stateAnalyzing" as never),
      className: "bg-muted text-muted-foreground",
      icon: Loader2,
    },
    completed: {
      label: t("analysis.stateCompleted" as never),
      className: "bg-primary/10 text-primary",
      icon: CheckCircle2,
    },
    failed: {
      label: t("analysis.stateFailed" as never),
      className: "bg-warning-soft text-warning",
      icon: AlertTriangle,
    },
  };
  const item = map[state];
  if (!item) return null;
  const Icon = item.icon;
  const spin = state === "analyzing" || state === "uploading";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${item.className}`}
    >
      <Icon className={`size-3.5 ${spin ? "animate-spin" : ""}`} />
      {item.label}
    </span>
  );
}

function toPascal(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
