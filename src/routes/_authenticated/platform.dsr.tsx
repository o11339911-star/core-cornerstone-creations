import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Inbox, ShieldCheck } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  RefreshAction,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  decideDsrRequest,
  listDsrRequests,
  verifyDsrIdentity,
  type DsrRequest,
} from "@/lib/privacy.functions";

const STATUS_LABEL: Record<string, string> = {
  submitted: "مُقدَّم",
  identity_verification: "التحقق من الهوية",
  in_review: "قيد الدراسة",
  fulfilled: "مُنفَّذ",
  partially_fulfilled: "مُنفَّذ جزئيًا",
  rejected: "مرفوض",
  closed: "مغلق",
};

export const Route = createFileRoute("/_authenticated/platform/dsr")({
  component: PlatformDsrPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "طلبات حقوق أصحاب البيانات | ركيز" },
      {
        name: "description",
        content: "معالجة طلبات الوصول والتصحيح والحذف والتصدير داخل فريق الخصوصية في ركيز.",
      },
      { property: "og:title", content: "طلبات حقوق أصحاب البيانات | ركيز" },
      { property: "og:description", content: "طابور طلبات الخصوصية ومسار البتّ الموثق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RequestCard({ request }: { request: DsrRequest }) {
  const queryClient = useQueryClient();
  const verify = useServerFn(verifyDsrIdentity);
  const decide = useServerFn(decideDsrRequest);
  const [decision, setDecision] = React.useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["platform-dsr"] });

  const verifyMutation = useMutation({
    mutationFn: () =>
      verify({ data: { requestId: request.id, method: "تحقق يدوي من الهوية داخل المنصة" } }),
    onSuccess: () => {
      toast.success("تم التحقق ونقل الطلب للدراسة");
      invalidate();
    },
    onError: () => toast.error("تعذّر إتمام التحقق"),
  });

  const decideMutation = useMutation({
    mutationFn: (outcome: "fulfilled" | "rejected") =>
      decide({ data: { requestId: request.id, outcome, decisionAr: decision.trim() } }),
    onSuccess: () => {
      toast.success("تم تسجيل القرار");
      setDecision("");
      invalidate();
    },
    onError: () => toast.error("تعذّر تسجيل القرار"),
  });

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{request.kind}</span>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
          {STATUS_LABEL[request.status] ?? request.status}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{request.details_ar}</p>

      {request.status === "submitted" || request.status === "identity_verification" ? (
        <Button
          type="button"
          className="mt-3 min-h-11"
          disabled={verifyMutation.isPending}
          onClick={() => verifyMutation.mutate()}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          {verifyMutation.isPending ? "جارٍ التحقق…" : "تحقق من الهوية وابدأ الدراسة"}
        </Button>
      ) : null}

      {request.status === "in_review" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            value={decision}
            placeholder="نص القرار (5 أحرف على الأقل)"
            onChange={(event) => setDecision(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={decision.trim().length < 5 || decideMutation.isPending}
              onClick={() => decideMutation.mutate("fulfilled")}
            >
              تنفيذ الطلب
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={decision.trim().length < 5 || decideMutation.isPending}
              onClick={() => decideMutation.mutate("rejected")}
            >
              رفض مع التسبيب
            </Button>
          </div>
        </div>
      ) : null}

      {request.decision_ar ? (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
          القرار: {request.decision_ar}
        </p>
      ) : null}
    </li>
  );
}

function PlatformDsrPage() {
  const fetchRequests = useServerFn(listDsrRequests);
  const requests = useQuery({
    queryKey: ["platform-dsr"],
    queryFn: () => fetchRequests({ data: {} }),
  });

  if (requests.isPending) return <CardsSkeleton cards={2} />;
  if (requests.isError) {
    return <ErrorState description="تعذّر تحميل طلبات الخصوصية." onRetry={() => requests.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="طلبات حقوق أصحاب البيانات"
        subtitle="تحقق من الهوية ثم دراسة ثم قرار مسبّب، مع تسجيل كل انتقال تلقائيًا."
        aside={<RefreshAction onRefresh={() => void requests.refetch()} busy={requests.isFetching} />}
      />
      <SectionCard icon={Inbox} title="الطلبات" count={requests.data.length}>
        {requests.data.length === 0 ? (
          <SoftEmpty icon={Inbox} message="لا توجد طلبات خصوصية حاليًا." />
        ) : (
          <ul className="space-y-3">
            {requests.data.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
