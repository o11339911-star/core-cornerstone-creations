import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, HeroBadge, SectionCard } from "@/components/rakeez";
import {
  getOfficialEmail,
  setOfficialEmail,
  verifyOfficialEmail,
} from "@/lib/official-email.functions";

const STATUS: Record<string, { text: string; tone: "success" | "warning" | "neutral" }> = {
  verified: { text: "موثق", tone: "success" },
  pending: { text: "بانتظار التحقق", tone: "warning" },
  not_linked: { text: "غير مربوط", tone: "neutral" },
};

/**
 * بطاقة «البريد الرسمي» للفرد أو الكيان.
 * التوثيق يقرره الخادم دائمًا، وتغيير البريد يُسقط التوثيق ويستأنف التحقق.
 */
export function OfficialEmailCard({ entityId = null }: { entityId?: string | null }) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getOfficialEmail);
  const save = useServerFn(setOfficialEmail);
  const verify = useServerFn(verifyOfficialEmail);

  const state = useQuery({
    queryKey: ["official-email", entityId],
    queryFn: () => fetchState({ data: { entityId } }),
  });

  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state.data?.email) setEmail(state.data.email);
  }, [state.data?.email]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["official-email", entityId] });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { entityId, email: email.trim().toLowerCase() } }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.info("خدمة البريد الرسمي قيد التجهيز لدى مدير النظام");
        return;
      }
      toast.success(
        res.status === "verified"
          ? "تم توثيق البريد الرسمي"
          : res.delivered
            ? "أرسلنا رمز التأكيد إلى بريدك"
            : "حُفظ البريد — إرسال رمز التأكيد يتطلب إعداد بريد المنصة من مدير النظام",
      );
      invalidate();
    },
    onError: () => toast.error("تعذّر حفظ البريد الرسمي"),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: { entityId, code } }),
    onSuccess: () => {
      toast.success("تم توثيق البريد الرسمي");
      setCode("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "CODE_EXPIRED"
          ? "انتهت صلاحية الرمز — اطلب رمزًا جديدًا"
          : "الرمز غير صحيح",
      ),
  });

  if (state.isPending) return <Skeleton className="h-56 w-full rounded-2xl" />;
  if (state.isError)
    return <ErrorState description="تعذّر تحميل البريد الرسمي" onRetry={() => void state.refetch()} />;

  const status = STATUS[state.data?.status ?? "not_linked"]!;
  const changed = email.trim().toLowerCase() !== (state.data?.email ?? "").toLowerCase();

  return (
    <SectionCard
      icon={MailCheck}
      title="البريد الرسمي"
      action={<HeroBadge tone={status.tone}>{status.text}</HeroBadge>}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`official-email-${entityId ?? "me"}`}>عنوان البريد</Label>
          <Input
            id={`official-email-${entityId ?? "me"}`}
            dir="ltr"
            className="min-h-11 text-start"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="name@example.com"
          />
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
          <p className="text-xs text-muted-foreground">
            البريد الرسمي بيان تعريفي قابل للتحقق، ولا يمنح أي صلاحية إضافية. أي تغيير يتطلب تحققًا
            جديدًا.
          </p>
        </div>

        <Button
          type="button"
          className="min-h-11"
          disabled={saveMutation.isPending || (!changed && state.data?.status === "verified")}
          onClick={() => {
            const v = email.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
              setError("أدخل عنوان بريد صحيح");
              return;
            }
            saveMutation.mutate();
          }}
        >
          {saveMutation.isPending
            ? "جارٍ الحفظ…"
            : state.data?.status === "verified" && !changed
              ? "موثق"
              : "حفظ وإرسال رمز التأكيد"}
        </Button>

        {state.data?.status === "pending" ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/40 p-3">
            <Label htmlFor={`official-code-${entityId ?? "me"}`}>رمز التأكيد (6 أرقام)</Label>
            <Input
              id={`official-code-${entityId ?? "me"}`}
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              className="min-h-11 text-start"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={code.length !== 6 || verifyMutation.isPending}
              onClick={() => verifyMutation.mutate()}
            >
              {verifyMutation.isPending ? "جارٍ التحقق…" : "تأكيد الملكية"}
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
