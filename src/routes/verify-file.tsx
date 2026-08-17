import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/rakeez";
import { verifyArchiveFile, type ArchiveVerifyResult } from "@/lib/archive-verify.functions";
import { toAsciiDigits } from "@/lib/office-files";

export const Route = createFileRoute("/verify-file")({
  component: VerifyFilePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "تحقق من ملف | ركيز" },
      {
        name: "description",
        content:
          "تحقق من صحة أي ملف صادر من أرشيف ركيز باستخدام رقم الملف وتاريخ الإصدار، دون كشف أي محتوى أو بيانات خاصة.",
      },
      { property: "og:title", content: "تحقق من ملف | ركيز" },
      {
        property: "og:description",
        content: "أدخل رقم الملف وتاريخه لمعرفة ما إذا كانت بصمة ركيز صالحة أو ملغاة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const REFERENCE = /^RKZ-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const DATE = /^\d{4}\/\d{2}\/\d{2}$/;

function VerifyFilePage() {
  const verify = useServerFn(verifyArchiveFile);
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [errors, setErrors] = React.useState<{ reference?: string; date?: string }>({});
  const [result, setResult] = React.useState<ArchiveVerifyResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => verify({ data: { reference, date } }),
    onSuccess: (res) => setResult(res),
    onError: () => setResult(null),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: { reference?: string; date?: string } = {};
    if (!REFERENCE.test(reference.toUpperCase()))
      next.reference = "أدخل رقم الملف بالصيغة RKZ-XXXX-XXXX-XXXX.";
    if (!DATE.test(date)) next.date = "أدخل التاريخ بالصيغة YYYY/MM/DD بالأرقام الغربية.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setResult(null);
    mutation.mutate();
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <BadgeCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-foreground">تحقق من ملف</h1>
        <p className="text-sm text-muted-foreground">
          بصمة ركيز سجل سلامة للمنصة يثبت أن الملف صدر من أرشيف ركيز ولم يتغيّر، وليست توقيعًا
          حكوميًا.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card"
      >
        <div className="space-y-2">
          <Label htmlFor="verify-reference">رقم الملف</Label>
          <Input
            id="verify-reference"
            value={reference}
            onChange={(e) => setReference(toAsciiDigits(e.target.value).toUpperCase())}
            placeholder="RKZ-7M4Q-X9PK-2H6D"
            dir="ltr"
            className="min-h-11 text-start"
            autoComplete="off"
            aria-invalid={!!errors.reference}
          />
          {errors.reference ? (
            <p className="text-xs text-destructive">{errors.reference}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="verify-date">تاريخ الإصدار</Label>
          <Input
            id="verify-date"
            value={date}
            onChange={(e) => setDate(toAsciiDigits(e.target.value))}
            placeholder="2026/08/17"
            dir="ltr"
            className="min-h-11 text-start"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!!errors.date}
          />
          {errors.date ? <p className="text-xs text-destructive">{errors.date}</p> : null}
        </div>

        <Button type="submit" className="min-h-11 w-full gap-2" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-4" aria-hidden="true" />
          )}
          {mutation.isPending ? "جارٍ التحقق…" : "تحقق"}
        </Button>
      </form>

      {mutation.isError ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          تعذّر إتمام التحقق الآن. حاول مرة أخرى بعد قليل.
        </div>
      ) : null}

      {result ? (
        result.found ? (
          <section
            aria-live="polite"
            className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center gap-2">
              {result.status === "valid" ? (
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              ) : (
                <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
              )}
              <p className="text-base font-semibold text-foreground">
                {result.status === "valid" ? "الملف صالح" : "الملف ملغي"}
              </p>
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">اسم الملف</dt>
                <dd className="font-medium text-foreground">{result.file_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">الجهة المصدرة</dt>
                <dd className="font-medium text-foreground">{result.issuer}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">رقم الملف</dt>
                <dd className="font-medium text-foreground">
                  <bdi dir="ltr">{result.reference}</bdi>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">تاريخ الإصدار</dt>
                <dd className="font-medium text-foreground">
                  <bdi dir="ltr">{result.issued_at}</bdi>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">البصمة المختصرة</dt>
                <dd className="font-medium text-foreground">
                  <bdi dir="ltr">{result.fingerprint}</bdi>
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <section
            aria-live="polite"
            className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground"
          >
            لا يوجد ملف موثق مطابق لرقم الملف والتاريخ المدخلين.
          </section>
        )
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/" className="underline underline-offset-4">
          العودة إلى الصفحة الرئيسية
        </Link>
      </p>
    </main>
  );
}
