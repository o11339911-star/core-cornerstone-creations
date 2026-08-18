import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CardsSkeleton,
  ErrorState,
  Num,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { adminListAuditLog } from "@/lib/platform-audit.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/audit")({
  component: PlatformAuditPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "سجل التدقيق | إدارة ركيز" },
      {
        name: "description",
        content:
          "سجل تدقيق إداري للقراءة فقط في منصة ركيز: من فعل ماذا ومتى على الصلاحيات والوصول الاستثنائي.",
      },
      { property: "og:title", content: "سجل التدقيق | إدارة ركيز" },
      { property: "og:description", content: "قراءة وبحث وتصفية سجل التدقيق وفق الصلاحية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACTION_AR: Record<string, string> = {
  insert: "إضافة",
  update: "تعديل",
  revoke: "سحب",
  delete: "حذف",
  request: "طلب",
  approve: "اعتماد",
  deny: "رفض",
  assign: "إسناد",
  reassign: "إعادة إسناد",
  resolve: "إنجاز",
  grant: "منح",
};

const OBJECT_AR: Record<string, string> = {
  membership: "عضوية",
  grant: "منحة صلاحية",
  platform_breakglass: "وصول طارئ",
  platform_queue_item: "عنصر طابور",
  platform_case_access: "وصول مرتبط بحالة",
  platform_staff: "موظف منصة",
};

const ACTION_FILTERS = [
  { key: "", label: "كل الأفعال" },
  { key: "approve", label: "اعتماد" },
  { key: "revoke", label: "سحب" },
  { key: "update", label: "تعديل" },
] as const;

function PlatformAuditPage() {
  const fetchAudit = useServerFn(adminListAuditLog);
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<string>("");

  const result = useQuery({
    queryKey: ["platform-audit", query, action],
    queryFn: () =>
      fetchAudit({
        data: {
          ...(query ? { q: query } : {}),
          ...(action ? { action } : {}),
          limit: 100,
        },
      }),
  });

  const message = (result.error as Error | null)?.message;

  return (
    <div className="space-y-6">
      <PageHero
        title="سجل التدقيق"
        subtitle="قراءة فقط — السجل لاحق ولا يُعدَّل ولا يُحذف من الواجهة."
      />

      <SectionCard icon={ScrollText} title="السجلات" count={result.data?.rows.length ?? 0}>
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(term.trim());
          }}
        >
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث باسم المنفّذ أو نوع العنصر"
            className="min-h-11 w-full sm:w-72"
            aria-label="بحث في سجل التدقيق"
          />
          <Button type="submit" variant="outline" className="min-h-11 gap-2">
            <Search className="size-4" aria-hidden="true" />
            بحث
          </Button>
          <div className="flex flex-wrap gap-2">
            {ACTION_FILTERS.map((f) => (
              <Button
                key={f.key || "all"}
                type="button"
                variant={action === f.key ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setAction(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </form>

        {result.isPending ? (
          <CardsSkeleton cards={4} />
        ) : result.isError ? (
          <ErrorState
            description={
              message === "FORBIDDEN"
                ? "سجل التدقيق متاح لمدير النظام وفريق الالتزام فقط."
                : "تعذّر تحميل سجل التدقيق الآن."
            }
            onRetry={() => void result.refetch()}
          />
        ) : !result.data?.available ? (
          <SoftEmpty
            icon={ScrollText}
            message={result.data?.reason ?? "سجل التدقيق غير مفعّل بعد."}
          />
        ) : result.data.rows.length === 0 ? (
          <SoftEmpty icon={ScrollText} message="لا توجد سجلات مطابقة لهذا البحث." />
        ) : (
          <ul className="space-y-2">
            {result.data.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {OBJECT_AR[row.object_type] ?? row.object_type} ·{" "}
                    {ACTION_AR[row.action] ?? row.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    المنفّذ: {row.actor_name ?? "غير معروف"} ·{" "}
                    <Num>{formatDateTime(row.created_at)}</Num>
                  </p>
                </div>
                <Badge variant="secondary">{ACTION_AR[row.action] ?? row.action}</Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          لا يعرض السجل قيم الحقول الحساسة ولا هويات كاملة؛ يعرض من فعل ماذا ومتى فقط.
        </p>
      </SectionCard>
    </div>
  );
}
