import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, ScrollText, ShieldCheck } from "lucide-react";

import { MarkdownView } from "@/components/legal/markdown-view";
import { LEGAL_DISCLAIMER } from "@/components/legal/legal-document-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  acceptPolicies,
  getLegalDocument,
  getPendingAcceptances,
  LEGAL_CODES,
  type LegalCode,
} from "@/lib/legal.functions";

/**
 * Phase 26 — mandatory acceptance gate.
 *
 * Rakeez has no self-registration, so the acceptance point is the first
 * authenticated screen after sign-in (and the invitation flow). Every checkbox
 * starts UNCHECKED and is per document version — no bundled or pre-ticked
 * consent, and no "continue" without an explicit tick for each document.
 */

function isLegalCode(code: string): code is LegalCode {
  return (LEGAL_CODES as readonly string[]).includes(code);
}

function DocumentBody({ code }: { code: LegalCode }) {
  const fetchDoc = useServerFn(getLegalDocument);
  const doc = useQuery({
    queryKey: ["legal-doc", code],
    queryFn: () => fetchDoc({ data: { code } }),
    staleTime: 5 * 60 * 1000,
  });

  if (doc.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (doc.isError || !doc.data) {
    return (
      <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
        تعذّر عرض نص الوثيقة الآن، ويمكنك فتحها من صفحة الوثائق النظامية.
      </p>
    );
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4">
      <MarkdownView source={doc.data.body_md} />
    </div>
  );
}

export function PolicyAcceptanceGate({
  context = "login_gate",
  children,
}: {
  context?: "login_gate" | "invitation";
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const fetchPending = useServerFn(getPendingAcceptances);
  const submit = useServerFn(acceptPolicies);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [openCode, setOpenCode] = React.useState<string | null>(null);

  const pending = useQuery({
    queryKey: ["pending-policy-acceptances"],
    queryFn: () => fetchPending(),
    staleTime: 60 * 1000,
  });

  const accept = useMutation({
    mutationFn: (versionIds: string[]) => submit({ data: { versionIds, context } }),
    onSuccess: () => {
      toast.success("تم تسجيل موافقتك على الوثائق النظامية");
      void queryClient.invalidateQueries({ queryKey: ["pending-policy-acceptances"] });
    },
    onError: () => toast.error("تعذّر تسجيل الموافقة، حاول مرة أخرى"),
  });

  if (pending.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // A failed check must never lock the product; the next navigation retries.
  if (pending.isError || !pending.data || pending.data.length === 0) {
    return <>{children}</>;
  }

  const items = pending.data;
  const allChecked = items.every((item) => checked[item.version_id]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-secondary p-2 text-primary">
            <ScrollText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">الوثائق النظامية تحتاج موافقتك</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              نُشرت نسخة جديدة من الوثائق التالية. اقرأ كل وثيقة ثم وافق عليها بشكل منفصل
              للمتابعة. لا توجد خانة محددة مسبقًا.
            </p>
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-foreground">
          {LEGAL_DISCLAIMER}
        </p>
      </header>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.version_id}
            className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-foreground">
                <FileText className="size-4 text-primary" aria-hidden="true" />
                <span className="font-semibold">{item.title_ar}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  v{item.version}
                </span>
              </div>
              {isLegalCode(item.code) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setOpenCode(openCode === item.code ? null : item.code)}
                >
                  {openCode === item.code ? "إخفاء النص" : "قراءة النص"}
                </Button>
              ) : null}
            </div>

            {openCode === item.code && isLegalCode(item.code) ? (
              <div className="mt-3">
                <DocumentBody code={item.code} />
              </div>
            ) : null}

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 px-3 py-3">
              <Checkbox
                checked={checked[item.version_id] ?? false}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [item.version_id]: value === true }))
                }
                className="mt-0.5 size-5"
                aria-label={`الموافقة على ${item.title_ar}`}
              />
              <span className="text-sm text-foreground">
                قرأت {item.title_ar} (النسخة <span dir="ltr">{item.version}</span>) وأوافق عليها.
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {allChecked
            ? "يمكنك المتابعة الآن."
            : "يلزم تحديد موافقة صريحة على كل وثيقة قبل المتابعة."}
        </p>
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          disabled={!allChecked || accept.isPending}
          onClick={() => accept.mutate(items.map((item) => item.version_id))}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          {accept.isPending ? "جارٍ التسجيل…" : "أوافق وأتابع"}
        </Button>
      </div>
    </div>
  );
}
