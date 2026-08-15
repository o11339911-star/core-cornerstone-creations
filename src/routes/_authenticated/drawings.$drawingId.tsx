import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCheck,
  DraftingCompass,
  Eye,
  FileStack,
  MessageSquare,
  RefreshCw,
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
import {
  addDrawingMarkup,
  enqueueDrawingConversion,
  getDrawing,
  getDrawingFileUrl,
  resolveDrawingMarkup,
  setDrawingStatus,
} from "@/lib/drawings.functions";
import {
  DISCIPLINE_AR,
  DRAWING_STATUS_AR,
  statusTone,
} from "./projects.$projectId.drawings";

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

const NEXT_STATUSES: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "under_review", label: "إرسال للمراجعة" }],
  under_review: [
    { to: "approved", label: "اعتماد" },
    { to: "returned", label: "إعادة للتعديل" },
  ],
  returned: [{ to: "under_review", label: "إعادة الإرسال للمراجعة" }],
  approved: [
    { to: "issued_for_construction", label: "إصدار للتنفيذ" },
    { to: "superseded", label: "وسم كمُستبدل" },
  ],
  issued_for_construction: [
    { to: "as_built", label: "وسم كما نُفِّذ" },
    { to: "superseded", label: "وسم كمُستبدل" },
  ],
  as_built: [{ to: "superseded", label: "وسم كمُستبدل" }],
  superseded: [],
};

function DrawingViewerPage() {
  const { drawingId } = Route.useParams();
  const qc = useQueryClient();

  const fetchDrawing = useServerFn(getDrawing);
  const fileUrl = useServerFn(getDrawingFileUrl);
  const changeStatus = useServerFn(setDrawingStatus);
  const enqueue = useServerFn(enqueueDrawingConversion);
  const addMarkup = useServerFn(addDrawingMarkup);
  const resolveMarkup = useServerFn(resolveDrawingMarkup);

  const query = useQuery({
    queryKey: ["drawing", drawingId],
    queryFn: () => fetchDrawing({ data: { drawingId } }),
  });

  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["drawing", drawingId] });

  const statusMutation = useMutation({
    mutationFn: (toStatus: string) =>
      changeStatus({
        data: {
          drawingId,
          toStatus: toStatus as "under_review",
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      setNote("");
      toast.success("حُدِّثت حالة المخطط");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewMutation = useMutation({
    mutationFn: (versionId: string) => fileUrl({ data: { versionId } }),
    onSuccess: (result) => setPreview(result.url),
    onError: (error: Error) => toast.error(error.message),
  });

  const convertMutation = useMutation({
    mutationFn: (versionId: string) => enqueue({ data: { versionId } }),
    onSuccess: (result) => {
      toast.success(
        result.status === "disabled"
          ? "تكامل العرض ثلاثي الأبعاد معطّل حاليًا — سُجّلت المهمة للتفعيل لاحقًا."
          : "أُدرجت مهمة تجهيز العرض",
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
      toast.success("أُضيفت الملاحظة");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveMutation = useMutation({
    mutationFn: (markupId: string) => resolveMarkup({ data: { markupId } }),
    onSuccess: () => {
      toast.success("أُغلقت الملاحظة");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <CardsSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل المخطط"
        description="حدث خطأ أثناء جلب بيانات المخطط."
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data) {
    return (
      <ErrorState
        title="المخطط غير متاح"
        description="المخطط غير موجود أو لا تملك صلاحية الاطلاع عليه."
      />
    );
  }

  const { drawing, revisions, events, markups, jobs } = query.data;
  const latest = revisions[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHero
        title={`${drawing.drawing_no} — ${drawing.title}`}
        subtitle={`${DISCIPLINE_AR[drawing.discipline] ?? drawing.discipline}${
          drawing.sheet_no ? ` · لوحة ${drawing.sheet_no}` : ""
        }`}
        badge={
          <HeroBadge tone={statusTone(drawing.status)}>
            {DRAWING_STATUS_AR[drawing.status] ?? drawing.status}
          </HeroBadge>
        }
      />

      <Link
        to="/projects/$projectId/drawings"
        params={{ projectId: drawing.project_id }}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
      >
        العودة إلى مخططات المشروع
      </Link>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Eye} title="المعاينة">
          {latest ? (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => previewMutation.mutate(latest.document_version_id)}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? "جارٍ التحضير…" : "فتح آخر نسخة"}
              </Button>
              {preview && latest.format === "pdf" ? (
                <iframe
                  src={preview}
                  title="معاينة المخطط"
                  className="h-[480px] w-full rounded-xl border border-border"
                />
              ) : preview ? (
                <a
                  href={preview}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  تنزيل الملف الأصلي (رابط مؤقت)
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
                  تجهيز عرض ثلاثي الأبعاد
                </Button>
              ) : null}
            </div>
          ) : (
            <SoftEmpty icon={DraftingCompass} message="لا توجد نسخ بعد — ارفع النسخة الأولى من صفحة المشروع." />
          )}
        </SectionCard>

        <SectionCard icon={FileStack} title="النسخ" count={revisions.length}>
          {revisions.length === 0 ? (
            <SoftEmpty icon={FileStack} message="لا توجد نسخ محفوظة لهذا المخطط." />
          ) : (
            <ul className="divide-y divide-border/60">
              {revisions.map((rev) => (
                <li key={rev.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {rev.revision_label} · <span dir="ltr">{rev.format.toUpperCase()}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(rev.created_at)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => previewMutation.mutate(rev.document_version_id)}
                  >
                    فتح
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={CheckCheck} title="الحالة والاعتماد">
          <FieldGrid>
            <Field label="الحالة الحالية" value={DRAWING_STATUS_AR[drawing.status] ?? drawing.status} />
            <Field label="آخر تحديث" value={formatDateTime(drawing.updated_at)} />
          </FieldGrid>
          <div className="mt-3 space-y-2">
            <Label htmlFor="status-note">ملاحظة (إلزامية عند الإعادة للتعديل)</Label>
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
                  {next.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              لا يمكن لرافع آخر نسخة اعتمادها أو إعادتها — الاعتماد من شخص آخر حصرًا.
            </p>
          </div>

          <ul className="mt-4 space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">
                  {DRAWING_STATUS_AR[event.to_status] ?? event.to_status}
                </span>{" "}
                · {formatDateTime(event.created_at)}
                {event.note ? <span className="block text-muted-foreground">{event.note}</span> : null}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={MessageSquare} title="الملاحظات" count={markups.length}>
          {latest ? (
            <div className="space-y-2">
              <Label htmlFor="markup-body">ملاحظة على آخر نسخة</Label>
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
                {commentMutation.isPending ? "جارٍ الإضافة…" : "إضافة ملاحظة"}
              </Button>
            </div>
          ) : null}

          {markups.length === 0 ? (
            <SoftEmpty icon={MessageSquare} message="لا توجد ملاحظات على هذا المخطط." />
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {markups.map((markup) => (
                <li key={markup.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{markup.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(markup.created_at)}
                      {markup.resolved_at ? " · مغلقة" : ""}
                    </p>
                  </div>
                  {!markup.resolved_at ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => resolveMutation.mutate(markup.id)}
                    >
                      إغلاق
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {jobs.length ? (
        <SectionCard icon={RefreshCw} title="مهام تجهيز العرض" count={jobs.length}>
          <ul className="divide-y divide-border/60">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-foreground">
                  {job.provider === "aps" ? "Autodesk APS" : "معالجة محلية"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {job.status === "disabled"
                    ? "معطّل"
                    : job.status === "succeeded"
                      ? "جاهز"
                      : job.status === "failed"
                        ? "فشل"
                        : "قيد الانتظار"}{" "}
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
