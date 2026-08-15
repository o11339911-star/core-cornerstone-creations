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
import {
  CAD_BUCKET,
  DRAWING_DISCIPLINES,
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

export const DISCIPLINE_AR: Record<string, string> = {
  architectural: "معماري",
  structural: "إنشائي",
  mechanical: "ميكانيكي",
  electrical: "كهربائي",
  plumbing: "صحي",
  civil: "مدني",
  landscape: "تنسيق موقع",
  survey: "مساحي",
  other: "أخرى",
};

export const DRAWING_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  returned: "مُعاد للتعديل",
  approved: "معتمد",
  issued_for_construction: "صادر للتنفيذ",
  as_built: "كما نُفِّذ",
  superseded: "مُستبدل",
};

export function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "approved" || status === "issued_for_construction" || status === "as_built")
    return "success";
  if (status === "returned") return "danger";
  if (status === "under_review") return "warning";
  return "neutral";
}

const ALLOWED_EXT = ["pdf", "dwg", "dxf", "ifc", "zip"] as const;
type AllowedExt = (typeof ALLOWED_EXT)[number];

const MIME_BY_EXT: Record<AllowedExt, string> = {
  pdf: "application/pdf",
  dwg: "application/octet-stream",
  dxf: "application/octet-stream",
  ifc: "application/octet-stream",
  zip: "application/zip",
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
      toast.success("أُنشئ سجل المخطط");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileInput.current?.files?.[0];
      if (!file || !uploadTarget) throw new Error("اختر ملف المخطط أولًا");
      const ext = (file.name.split(".").pop() ?? "").toLowerCase() as AllowedExt;
      if (!ALLOWED_EXT.includes(ext)) {
        throw new Error("الصيغ المسموحة: PDF أو DWG أو DXF أو IFC أو ZIP");
      }
      if (!revisionLabel.trim()) throw new Error("اكتب رقم المراجعة");
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
      toast.success("رُفعت نسخة المخطط");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (drawings.isPending) return <CardsSkeleton />;
  if (drawings.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل المخططات"
        description="حدث خطأ أثناء جلب مخططات المشروع."
        onRetry={() => void drawings.refetch()}
      />
    );
  }

  const rows = drawings.data;
  const approved = rows.filter((r) =>
    ["approved", "issued_for_construction", "as_built"].includes(r.status),
  ).length;
  const inReview = rows.filter((r) => r.status === "under_review").length;

  return (
    <div className="space-y-6">
      <PageHero
        title="المخططات الهندسية"
        subtitle="سجلات المخططات ونسخها الأصلية — لا تُعدَّل ولا تُحذف، ولا تُعتمد إلا من غير رافعها."
        badge={<HeroBadge tone="neutral">وحدة المخططات</HeroBadge>}
      />

      <StatGrid>
        <StatCard icon={DraftingCompass} label="إجمالي المخططات" value={rows.length} tone="primary" />
        <StatCard icon={ShieldCheck} label="معتمدة" value={approved} tone="success" />
        <StatCard icon={Ruler} label="قيد المراجعة" value={inReview} tone="warning" />
        <StatCard
          icon={PlugZap}
          label="تكامل العرض ثلاثي الأبعاد"
          value={moduleStatus.data?.apsEnabled ? "مفعّل" : "معطّل"}
          hint="Autodesk APS"
          tone="info"
        />
      </StatGrid>

      <SectionCard icon={DraftingCompass} title="إضافة مخطط">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="drawing-no">رقم المخطط</Label>
            <Input
              id="drawing-no"
              value={drawingNo}
              onChange={(e) => setDrawingNo(e.target.value)}
              placeholder="A-101"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-title">عنوان المخطط</Label>
            <Input
              id="drawing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مساقط الدور الأرضي"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-discipline">التخصص</Label>
            <select
              id="drawing-discipline"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {DRAWING_DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {DISCIPLINE_AR[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-sheet">رقم اللوحة (اختياري)</Label>
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
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !drawingNo.trim() || title.trim().length < 2}
          >
            {createMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء سجل المخطط"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={Ruler} title="مخططات المشروع" count={rows.length}>
        {rows.length === 0 ? (
          <SoftEmpty
            icon={DraftingCompass}
            message="لا توجد مخططات بعد — ابدأ بإنشاء سجل مخطط ثم ارفع نسخته الأولى."
          />
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
                      {DISCIPLINE_AR[row.discipline] ?? row.discipline}
                      {row.sheet_no ? ` · لوحة ${row.sheet_no}` : ""} ·{" "}
                      {formatDateTime(row.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <HeroBadge tone={statusTone(row.status)}>
                      {DRAWING_STATUS_AR[row.status] ?? row.status}
                    </HeroBadge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setUploadTarget(uploadTarget === row.id ? null : row.id)}
                    >
                      <Upload className="size-4" aria-hidden="true" />
                      رفع نسخة
                    </Button>
                  </div>
                </div>

                {uploadTarget === row.id ? (
                  <div className="grid gap-3 rounded-xl bg-secondary/50 p-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`rev-${row.id}`}>رقم المراجعة</Label>
                      <Input
                        id={`rev-${row.id}`}
                        value={revisionLabel}
                        onChange={(e) => setRevisionLabel(e.target.value)}
                        placeholder="Rev-A"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`reason-${row.id}`}>سبب الاستبدال</Label>
                      <Input
                        id={`reason-${row.id}`}
                        value={supersedeReason}
                        onChange={(e) => setSupersedeReason(e.target.value)}
                        placeholder="مطلوب عند وجود نسخة سابقة"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`file-${row.id}`}>ملف المخطط</Label>
                      <Input
                        id={`file-${row.id}`}
                        ref={fileInput}
                        type="file"
                        accept=".pdf,.dwg,.dxf,.ifc,.zip"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Button
                        onClick={() => uploadMutation.mutate()}
                        disabled={uploadMutation.isPending}
                      >
                        {uploadMutation.isPending ? "جارٍ الرفع…" : "رفع النسخة"}
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        الحد الأقصى ٢٠٠ ميجابايت. الملف الأصلي يُحفظ كما هو ولا يُحذف لاحقًا.
                      </p>
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
