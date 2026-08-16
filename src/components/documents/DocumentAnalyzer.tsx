import { Building2, CheckCircle2, FileSearch, UploadCloud } from "lucide-react";
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
import { listProperties } from "@/lib/properties.functions";
import { getPropertyProfile } from "@/lib/properties.functions";
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
  confirmAnalysis,
  recordAnalysis,
  rejectAnalysis,
  type AnalysisTarget,
} from "@/lib/analysis.functions";
import {
  analyzeFile,
  ocrAvailable,
  type ExtractedFieldKey,
  type ExtractionResult,
} from "@/lib/analysis/extract";

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

type Stage = "setup" | "extracting" | "review" | "done";

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
  const record = useServerFn(recordAnalysis);
  const confirm = useServerFn(confirmAnalysis);
  const reject = useServerFn(rejectAnalysis);
  const abort = useServerFn(abortUpload);

  const entityId = scope?.kind === "entity" ? scope.entityId : null;

  const [propertyId, setPropertyId] = React.useState(initialPropertyId ?? "");
  const [categoryCode, setCategoryCode] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [stage, setStage] = React.useState<Stage>("setup");
  const [duplicate, setDuplicate] = React.useState<{ versionId: string } | null>(null);
  const [extraction, setExtraction] = React.useState<ExtractionResult | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [target, setTarget] = React.useState<AnalysisTarget>(initialTarget ?? "deed");
  const [headId, setHeadId] = React.useState<string>("");
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [numberError, setNumberError] = React.useState<string | undefined>(undefined);

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
    target === "deed" ? profileQuery.data?.deeds ?? [] : profileQuery.data?.licenses ?? [];

  const resetPipeline = () => {
    setFile(null);
    setStage("setup");
    setDuplicate(null);
    setExtraction(null);
    setFields({});
    setHeadId("");
    setAnalysisId(null);
    setNumberError(undefined);
  };

  const startAnalysis = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("common.required"));
      if (!propertyId) throw new Error(t("analysis.pickProperty"));
      if (!categoryCode) throw new Error(t("analysis.pickCategory"));
      if (activeCategory) {
        const allowed = (activeCategory.allowed_mime as string[] | null) ?? null;
        if (allowed && allowed.length > 0 && !allowed.includes(file.type)) {
          throw new Error(t("documents.invalidType") ?? "نوع الملف غير مسموح لهذا التصنيف");
        }
        const maxBytes = (activeCategory.max_size_mb ?? 0) * 1024 * 1024;
        if (maxBytes > 0 && file.size > maxBytes) {
          throw new Error("حجم الملف يتجاوز الحد المسموح لهذا التصنيف");
        }
      }

      const checksum = await sha256Hex(file);

      // Duplicate check BEFORE creating anything.
      const docs = await fetchDocuments({
        data: { contextType: "property", contextId: propertyId },
      });
      for (const doc of docs) {
        const detail = await fetchDocument({ data: { documentId: doc.id } });
        const match = detail.versions.find((v) => v.checksum_sha256 === checksum);
        if (match) {
          setDuplicate({ versionId: match.id });
          throw new Error(t("analysis.duplicateFound"));
        }
      }

      setStage("extracting");
      const result = await analyzeFile(file);
      setExtraction(result);
      const initialFields: Record<string, string> = {};
      for (const key of FIELD_ORDER) {
        if (result.fields[key]) initialFields[key] = result.fields[key] as string;
      }
      setFields(initialFields);
      if (result.detectedType === "building_license") setTarget("building_license");
      else if (result.detectedType === "deed") setTarget("deed");
      setStage("review");
    },
    onError: (error: unknown) => {
      setStage("setup");
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("common.required"));
      const number = toLatinDigits((fields["number"] ?? "").trim());
      if (!/^[0-9A-Za-z/-]{1,60}$/.test(number)) {
        setNumberError(t("analysis.numberRequired"));
        throw new Error(t("analysis.numberRequired"));
      }
      setNumberError(undefined);

      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const checksum = await sha256Hex(file);
      const { documentId } = await createDoc({
        data: {
          ownerEntityId: entityId as string,
          categoryCode,
          title: `${categoryCode}-${number}`.slice(0, 200),
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

        await link({
          data: { documentId, contextType: "property", contextId: propertyId },
        });

        const { analysisId: newId } = await record({
          data: {
            documentVersionId: reserved.version_id,
            engine: extraction?.engine === "pdf_text" ? "pdf_text" : "manual",
            status: extraction?.ok ? "review_required" : "failed",
            detectedType: extraction?.detectedType ?? null,
            extractedFields: fields,
            fieldConfidence: extraction?.confidence ?? {},
            conflicts: extraction?.conflicts ?? [],
            failureReason: extraction?.failureReason ?? null,
          },
        });
        setAnalysisId(newId);
        return newId;
      } catch (uploadError) {
        await abort({
          data: {
            versionId: reserved.version_id,
            reason: uploadError instanceof Error ? uploadError.message : "upload failed",
          },
        }).catch(() => undefined);
        throw new Error(t("analysis.uploadFailed"));
      }
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!analysisId) throw new Error(t("common.error"));
      const number = toLatinDigits((fields["number"] ?? "").trim());

      const issue = normalizeDateInput(fields["issue_date"]);
      const expiry = normalizeDateInput(fields["expiry_date"]);
      const nextDateErrors: Record<string, string> = {};
      if (issue && !issue.ok) nextDateErrors["issue_date"] = t("analysis.invalidDate");
      if (expiry && !expiry.ok) nextDateErrors["expiry_date"] = t("analysis.invalidDate");

      const areaRaw = (fields["area"] ?? "").trim();
      const area = normalizeArea(areaRaw);
      if (areaRaw && area === null) nextDateErrors["area"] = t("analysis.invalidArea");

      setFieldErrors(nextDateErrors);
      if (Object.keys(nextDateErrors).length > 0) {
        throw new Error(Object.values(nextDateErrors)[0] as string);
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
        },
      });
    },
    onSuccess: () => {
      toast.success(t("analysis.applied"));
      setStage("done");
      void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : t("common.error")),
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
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : t("common.error")),
  });

  if (!entityId) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageHero title={t("analysis.title")} subtitle={t("analysis.subtitle")} />
        <SoftEmpty icon={Building2} message={t("analysis.selectEntityFirst")} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("analysis.title")} subtitle={t("analysis.subtitle")} />

      {stage === "setup" ? (
        <SectionCard icon={UploadCloud} title={t("analysis.title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("analysis.pickProperty")}</Label>
              {propertiesQuery.isLoading ? (
                <CardsSkeleton cards={1} />
              ) : (propertiesQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("analysis.noProperties")}</p>
              ) : (
                <Select value={propertyId} onValueChange={setPropertyId}>
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
              <Select value={categoryCode} onValueChange={setCategoryCode}>
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
              <Label>{t("analysis.pickFile")}</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {!ocrAvailable && file && file.type.startsWith("image/") ? (
                <p className="text-xs font-medium text-warning">{t("analysis.ocrUnavailable")}</p>
              ) : null}
            </div>

            {duplicate ? (
              <div className="sm:col-span-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
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

          <Button
            className="mt-4 min-h-11"
            onClick={() => {
              setDuplicate(null);
              startAnalysis.mutate();
            }}
            disabled={startAnalysis.isPending}
          >
            {startAnalysis.isPending ? t("analysis.analyzing") : t("analysis.analyze")}
          </Button>
        </SectionCard>
      ) : null}

      {stage === "extracting" ? <CardsSkeleton cards={1} /> : null}

      {stage === "review" && extraction ? (
        <SectionCard icon={FileSearch} title={t("analysis.reviewTitle")}>
          <p className="mb-4 text-sm text-muted-foreground">{t("analysis.reviewHint")}</p>
          {!extraction.ok ? (
            <p className="mb-4 text-sm font-medium text-warning">
              {extraction.failureReason ?? t("analysis.ocrUnavailable")}
            </p>
          ) : null}

          {heads.length > 0 ? (
            <div className="mb-4 space-y-2">
              <Label>{t("analysis.pickHead")}</Label>
              <Select value={headId || "__new__"} onValueChange={(v) => setHeadId(v === "__new__" ? "" : v)}>
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">{t("analysis.newHead")}</SelectItem>
                  {heads.map((h: any) => (
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
              const conflict = extraction.conflicts.find((c) => c.field === key);
              const confidencePct = extraction.confidence[key]
                ? Math.round((extraction.confidence[key] as number) * 100)
                : null;
              const isRequired = key === "number";
              return (
                <div key={key}>
                  {isRequired ? (
                    <TextField
                      id={`field-${key}`}
                      label={t(`analysis.field${toPascal(key)}` as any)}
                      required
                      error={numberError}
                      {...normalizedInput(fields[key] ?? "", (v) =>
                        setFields((prev) => ({ ...prev, [key]: v })),
                      )}
                    />
                  ) : (
                    <TextField
                      id={`field-${key}`}
                      label={t(`analysis.field${toPascal(key)}` as any)}
                      value={fields[key] ?? ""}
                      onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  )}
                  {confidencePct !== null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analysis.confidence")}: {confidencePct}%
                    </p>
                  ) : null}
                  {conflict ? (
                    <p className="mt-1 text-xs font-medium text-warning">
                      {t("analysis.conflict")}: {conflict.values.join(" / ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" className="min-h-11" onClick={resetPipeline}>
              {t("common.cancel")}
            </Button>
            <Button
              className="min-h-11"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending || Boolean(analysisId)}
            >
              {applyMutation.isPending ? t("analysis.uploading") : t("common.submit")}
            </Button>
          </div>

          {analysisId ? (
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
                  {t("analysis.apply")}
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {stage === "done" ? (
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
      ) : null}
    </div>
  );
}

function toPascal(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
