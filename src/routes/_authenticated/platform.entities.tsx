import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsSkeleton, ErrorState, Num, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { adminListEntities } from "@/lib/platform-admin.functions";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/platform/entities")({
  component: PlatformEntitiesPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الكيانات | إدارة ركيز" },
      {
        name: "description",
        content: "دليل كيانات منصة ركيز لمدير النظام: التصنيف والشكل النظامي والرقم الموحّد وحالة التحقق وعدد الأعضاء.",
      },
      { property: "og:title", content: "الكيانات | إدارة ركيز" },
      { property: "og:description", content: "دليل كيانات منصة ركيز لمدير النظام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TYPE_AR: Record<string, string> = {
  developer: "مطوّر عقاري",
  contractor: "مقاول",
  company: "شركة",
  design_office: "مكتب تصميم",
  supervision: "إشراف",
  inspector: "فاحص",
  marketer: "مسوّق",
};

const FORM_AR: Record<string, string> = {
  company: "شركة",
  establishment: "مؤسسة",
  partnership: "شراكة",
};

const VERIFY_AR: Record<string, string> = {
  unverified: "غير موثّق",
  pending: "تحقق صيغة",
  verified: "موثّق",
  rejected: "مرفوض",
};

function PlatformEntitiesPage() {
  const fetchEntities = useServerFn(adminListEntities);
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["admin-entities", q, page],
    queryFn: () => fetchEntities({ data: { q, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const forbidden = (query.error as Error | null)?.message === "FORBIDDEN";

  return (
    <div className="space-y-6">
      <PageHero title="الكيانات" subtitle="دليل الكيانات المسجّلة في المنصة وحالة توثيقها." />

      <SectionCard icon={Building2} title="بحث وقائمة" count={total}>
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQ(term.trim());
          }}
        >
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="اسم الكيان أو الرقم الوطني الموحّد"
            className="h-11"
            aria-label="بحث الكيانات"
          />
          <Button type="submit" className="min-h-11 gap-2">
            <Search className="size-4" aria-hidden="true" />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <CardsSkeleton cards={4} />
        ) : query.isError ? (
          <ErrorState
            description={forbidden ? "هذه القائمة متاحة لمدير النظام فقط." : (query.error as Error).message}
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={Building2} message="لا توجد نتائج مطابقة — جرّب مصطلح بحث آخر." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60">
                  <tr>
                    {["الاسم", "التصنيف", "الشكل النظامي", "الرقم الموحّد", "التحقق", "الأعضاء", "المالك", "الإنشاء"].map(
                      (h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-start font-semibold">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.entity_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link
                          to="/platform/entity/$entityId"
                          params={{ entityId: r.entity_id }}
                          search={{ hint: r.name }}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{TYPE_AR[r.type] ?? r.type}</td>
                      <td className="px-3 py-2">{r.legal_form ? (FORM_AR[r.legal_form] ?? r.legal_form) : "—"}</td>
                      <td className="px-3 py-2">
                        <Num>{r.unified_national_number ?? "—"}</Num>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={r.verification_status === "verified" ? "default" : "secondary"}>
                          {VERIFY_AR[r.verification_status ?? "unverified"] ?? r.verification_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Num>{r.members_count}</Num>
                      </td>
                      <td className="px-3 py-2">{r.owner_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Num>{formatDate(r.created_at)}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.entity_id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/platform/entity/$entityId"
                      params={{ entityId: r.entity_id }}
                      search={{ hint: r.name }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                    <Badge variant={r.verification_status === "verified" ? "default" : "secondary"}>
                      {VERIFY_AR[r.verification_status ?? "unverified"] ?? r.verification_status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TYPE_AR[r.type] ?? r.type}
                    {r.legal_form ? ` · ${FORM_AR[r.legal_form] ?? r.legal_form}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الرقم الموحّد: <Num>{r.unified_national_number ?? "—"}</Num>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الأعضاء: <Num>{r.members_count}</Num> · المالك: {r.owner_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الإنشاء: <Num>{formatDate(r.created_at)}</Num>
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                الإجمالي <Num>{total}</Num>
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
