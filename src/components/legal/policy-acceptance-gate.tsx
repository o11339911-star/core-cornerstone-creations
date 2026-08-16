import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, ShieldCheck } from "lucide-react";

import { MarkdownView } from "@/components/legal/markdown-view";
import { LEGAL_DISCLAIMER } from "@/components/legal/legal-document-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  acceptPolicies,
  getLegalDocument,
  getPendingAcceptances,
  LEGAL_CODES,
  type LegalCode,
} from "@/lib/legal.functions";

/**
 * Phase 26 — mandatory acceptance gate (compact single-card layout).
 *
 * Rakeez has no self-registration, so the acceptance point is the first
 * authenticated screen after sign-in (and the invitation flow). Every checkbox
 * starts UNCHECKED and is per document version — no bundled or pre-ticked
 * consent, and no "continue" without an explicit tick for each document.
 *
 * Layout: all pending documents are rendered as compact rows inside one card.
 * Each row keeps its own explicit acceptance checkbox. Document text opens in
 * an accordion within the same row, and only one row is expanded at a time.
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

  if (doc.isPending) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (doc.isError || !doc.data) {
    return (
      <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
        تعذّر عرض نص الوثيقة الآن، ويمكنك فتحها من صفحة الوثائق النظامية.
      </p>
    );
  }
  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
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
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // A failed check must never lock the product; the next navigation retries.
  if (pending.isError || !pending.data || pending.data.length === 0) {
    return <>{children}</>;
  }

  const items = pending.data;
  const allChecked = items.every((item) => checked[item.version_id]);
  const acceptedCount = items.filter((item) => checked[item.version_id]).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-2 p-4 sm:p-5">
          <CardTitle className="text-lg font-bold text-foreground sm:text-xl">
            الشروط والسياسات
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            نُشرت نسخة جديدة من الوثائق التالية. اقرأ كل وثيقة ثم وافق عليها بشكل منفصل
            للمتابعة.
          </CardDescription>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            {LEGAL_DISCLAIMER}
          </p>
        </CardHeader>

        <CardContent className="p-0">
          <Accordion
            type="single"
            collapsible
            value={openCode || undefined}
            onValueChange={(value) => setOpenCode(value || null)}
            className="w-full"
          >
            {items.map((item, index) => (
              <AccordionItem
                key={item.version_id}
                value={item.code}
                className="border-0"
              >
                {index > 0 ? <Separator className="mx-4 w-[calc(100%-2rem)]" /> : null}
                <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.title_ar}
                    </span>
                    <span
                      className="shrink-0 text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      v{item.version}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isLegalCode(item.code) ? (
                      <AccordionTrigger className="flex-none rounded-md border border-input bg-background px-2.5 py-0 text-xs font-normal hover:bg-accent hover:text-accent-foreground hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>svg]:hidden h-9 min-h-11 sm:min-h-0">
                        {openCode === item.code ? "إخفاء النص" : "عرض النص"}
                      </AccordionTrigger>
                    ) : null}

                    <label
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-muted/50 sm:h-9 sm:w-9"
                      aria-label={`الموافقة على ${item.title_ar}`}
                      title={`الموافقة على ${item.title_ar}`}
                    >
                      <Checkbox
                        checked={checked[item.version_id] ?? false}
                        onCheckedChange={(value) =>
                          setChecked((prev) => ({
                            ...prev,
                            [item.version_id]: value === true,
                          }))
                        }
                        className="size-5 sm:size-4"
                      />
                    </label>
                  </div>
                </div>

                <AccordionContent className="px-4 pb-3 sm:px-5">
                  <DocumentBody code={item.code} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">
            {allChecked
              ? "تمت الموافقة على كل الوثائق، يمكنك المتابعة."
              : `الوثائق المقبولة: ${acceptedCount} من ${items.length} — يلزم قبول صريح على كل وثيقة.`}
          </p>
          <Button
            type="button"
            className="h-11 w-full px-5 text-sm sm:h-10 sm:w-auto"
            disabled={!allChecked || accept.isPending}
            onClick={() => accept.mutate(items.map((item) => item.version_id))}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {accept.isPending ? "جارٍ التسجيل…" : "أوافق وأتابع"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
