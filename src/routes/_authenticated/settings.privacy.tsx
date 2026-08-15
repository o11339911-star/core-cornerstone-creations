import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck, Inbox } from "lucide-react";

import { CardsSkeleton, ErrorState, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DSR_KINDS,
  evaluateMyErasure,
  exportMyData,
  listMyDsrRequests,
  submitDsrRequest,
} from "@/lib/privacy.functions";

const KIND_LABEL: Record<string, string> = {
  access: "الوصول إلى بياناتي",
  rectification: "تصحيح بياناتي",
  erasure: "حذف بياناتي",
  export: "تصدير بياناتي",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "مُقدَّم",
  identity_verification: "التحقق من الهوية",
  in_review: "قيد الدراسة",
  fulfilled: "مُنفَّذ",
  partially_fulfilled: "مُنفَّذ جزئيًا",
  rejected: "مرفوض",
  closed: "مغلق",
};

export const Route = createFileRoute("/_authenticated/settings/privacy")({
  component: PrivacySettingsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الخصوصية وحقوق بياناتي | ركيز" },
      {
        name: "description",
        content:
          "قدّم طلب وصول أو تصحيح أو حذف أو تصدير لبياناتك في ركيز، وتابع حالة طلبك وقيود الحذف النظامية.",
      },
      { property: "og:title", content: "الخصوصية وحقوق بياناتي | ركيز" },
      {
        property: "og:description",
        content: "مسار موثق لممارسة حقوق صاحب البيانات داخل منصة ركيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PrivacySettingsPage() {
  const queryClient = useQueryClient();
  const fetchRequests = useServerFn(listMyDsrRequests);
  const fetchErasure = useServerFn(evaluateMyErasure);
  const runExport = useServerFn(exportMyData);
  const create = useServerFn(submitDsrRequest);

  const [kind, setKind] = React.useState<(typeof DSR_KINDS)[number]>("access");
  const [details, setDetails] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const requests = useQuery({ queryKey: ["my-dsr"], queryFn: () => fetchRequests() });
  const erasure = useQuery({ queryKey: ["my-erasure"], queryFn: () => fetchErasure() });

  const submit = useMutation({
    mutationFn: () => create({ data: { kind, detailsAr: details.trim() } }),
    onSuccess: () => {
      toast.success("تم تسجيل طلبك وسيُراجَع خلال 30 يومًا");
      setDetails("");
      void queryClient.invalidateQueries({ queryKey: ["my-dsr"] });
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("DUPLICATE")
          ? "لديك طلب مفتوح من النوع نفسه"
          : "تعذّر إرسال الطلب، حاول مرة أخرى",
      ),
  });

  const download = useMutation({
    mutationFn: () => runExport(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rakeez-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل نسخة من بياناتك");
    },
    onError: () => toast.error("تعذّر إنشاء نسخة البيانات الآن"),
  });

  if (requests.isPending || erasure.isPending) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <CardsSkeleton cards={2} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title="الخصوصية وحقوق بياناتي"
        subtitle="مارس حقوقك في الوصول والتصحيح والحذف والتصدير، وتابع كل خطوة في مسار موثق."
        aside={
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            <Download className="size-4" aria-hidden="true" />
            {download.isPending ? "جارٍ التجهيز…" : "تنزيل نسخة من بياناتي"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={ShieldCheck} title="تقديم طلب جديد">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {DSR_KINDS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={kind === option ? "default" : "outline"}
                  className="min-h-11"
                  onClick={() => setKind(option)}
                >
                  {KIND_LABEL[option]}
                </Button>
              ))}
            </div>
            <div>
              <label htmlFor="dsr-details" className="mb-1 block text-sm font-medium">
                تفاصيل الطلب
              </label>
              <Textarea
                id="dsr-details"
                value={details}
                rows={4}
                placeholder="اشرح طلبك بوضوح (10 أحرف على الأقل)"
                onChange={(event) => {
                  setDetails(event.target.value);
                  setFieldError(
                    event.target.value.trim().length < 10
                      ? "التفاصيل قصيرة جدًا — اكتب 10 أحرف على الأقل"
                      : null,
                  );
                }}
              />
              {fieldError ? (
                <p className="mt-1 text-xs text-destructive">{fieldError}</p>
              ) : null}
            </div>
            {kind === "erasure" && !erasure.data?.can_fully_erase ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">قيود نظامية على الحذف الكامل:</p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
                  {(erasure.data?.reasons ?? []).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={details.trim().length < 10 || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          icon={Inbox}
          title="طلباتي"
          count={requests.data?.length ?? 0}
          action={
            <Link
              to="/legal/privacy"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              <FileText className="size-4" aria-hidden="true" />
              سياسة الخصوصية
            </Link>
          }
        >
          {(requests.data?.length ?? 0) === 0 ? (
            <SoftEmpty icon={Inbox} message="لا توجد طلبات بعد — يمكنك تقديم أول طلب من هنا." />
          ) : (
            <ul className="space-y-3">
              {requests.data?.map((request) => (
                <li key={request.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {KIND_LABEL[request.kind] ?? request.kind}
                    </span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                      {STATUS_LABEL[request.status] ?? request.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{request.details_ar}</p>
                  {request.decision_ar ? (
                    <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
                      القرار: {request.decision_ar}
                    </p>
                  ) : null}
                  {request.due_at ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      الموعد النظامي للرد:{" "}
                      <span dir="ltr">{new Date(request.due_at).toLocaleDateString("ar-SA-u-nu-latn")}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
