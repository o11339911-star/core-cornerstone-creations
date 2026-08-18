import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LatinDatePicker, SectionCard } from "@/components/rakeez";
import { toLatinDigits } from "@/lib/format";
import { verifyAppointmentReference } from "@/lib/appointment-card.functions";
import { CalendarCheck2 } from "lucide-react";

type Search = { n: string; d: string };

export const Route = createFileRoute("/verify-appointment")({
  component: VerifyAppointmentPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>): Search => ({
    n: typeof search['n'] === "string" ? search['ref'] : "",
    d: typeof search['d'] === "string" ? search['d'] : "",
  }),
  head: () => ({
    meta: [
      { title: "تحقق من موعد | ركيز" },
      {
        name: "description",
        content:
          "تحقق عام من صحة موعد في منصة ركيز بالرقم المرجعي وتاريخ الموعد، دون كشف أي بيانات عن أطرافه.",
      },
      { property: "og:title", content: "تحقق من موعد | ركيز" },
      {
        property: "og:description",
        content: "أدخل الرقم المرجعي وتاريخ الموعد للتأكد من وجوده وحالته.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  proposed: "بانتظار الموافقة",
  confirmed: "موعد مؤكد",
  cancelled: "موعد ملغي",
  postponed: "بانتظار الموافقة على موعد جديد",
  completed: "موعد منتهٍ",
};

const KIND_LABEL: Record<string, string> = {
  visit: "زيارة موقع",
  consultation: "استشارة",
  meeting: "اجتماع",
};

type Result =
  | { kind: "found"; status: string; type: string; date: string }
  | { kind: "not-found" }
  | { kind: "unavailable" };

function VerifyAppointmentPage() {
  const search = Route.useSearch();
  const verify = useServerFn(verifyAppointmentReference);

  const [reference, setReference] = useState(
    toLatinDigits(search.n).replace(/[^0-9]/g, ""),
  );
  const [date, setDate] = useState(search.d);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (ref: string, d: string) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await verify({ data: { reference: ref, date: d } });
      if (!res.available) setResult({ kind: "unavailable" });
      else if (!res.found) setResult({ kind: "not-found" });
      else
        setResult({
          kind: "found",
          status: STATUS_LABEL[res.status ?? ""] ?? "غير محددة",
          type: KIND_LABEL[res.kind ?? ""] ?? "موعد",
          date: toLatinDigits(res.date ?? d),
        });
    } catch {
      setError("تعذّر إتمام التحقق الآن. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (/^[0-9]{6,}$/.test(reference) && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) {
      void run(reference, date);
    }
    // فحص تلقائي مرة واحدة عند الوصول من رمز التحقق.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!/^[0-9]{6,}$/.test(reference)) {
      setError("أدخل الجزء الرقمي من الرقم المرجعي (ستة أرقام فأكثر، 0-9).");
      return;
    }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) {
      setError("اختر تاريخ الموعد من التقويم.");
      return;
    }
    setError(null);
    void run(reference, date);
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">تحقق من موعد</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        أدخل الجزء الرقمي من الرقم المرجعي مع تاريخ الموعد. لا تُعرض أي بيانات عن أطراف الموعد.
      </p>

      <SectionCard icon={CalendarCheck2} title="بيانات التحقق" className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">الرقم المرجعي (Rakiz)</span>
            <Input
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              value={reference}
              onChange={(e) => {
                setReference(toLatinDigits(e.target.value).replace(/[^0-9]/g, "").slice(0, 20));
                setError(null);
              }}
              placeholder="123456"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">تاريخ الموعد</span>
            <LatinDatePicker value={date} onChange={setDate} invalid={!!error && !date} />
          </label>
        </div>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-4">
          <Button onClick={submit} disabled={busy}>
            {busy ? "جارٍ التحقق…" : "تحقق"}
          </Button>
        </div>
      </SectionCard>

      {result ? (
        <div className="mt-6 rounded-xl border border-border/60 bg-card p-4 text-sm">
          {result.kind === "found" ? (
            <div className="space-y-1">
              <p className="font-semibold text-primary">الموعد موجود ومطابق للتاريخ المدخل.</p>
              <p>
                النوع: {result.type} — الحالة: {result.status}
              </p>
              <p>
                التاريخ: <span dir="ltr">{result.date}</span>
              </p>
            </div>
          ) : result.kind === "not-found" ? (
            <p className="text-muted-foreground">
              لا يوجد موعد مطابق للرقم المرجعي والتاريخ المدخلين.
            </p>
          ) : (
            <p className="text-muted-foreground">
              خدمة التحقق من المواعيد غير مفعّلة بعد. حاول لاحقًا.
            </p>
          )}
        </div>
      ) : null}
    </main>
  );
}
