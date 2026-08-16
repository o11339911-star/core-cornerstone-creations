import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsSkeleton, ErrorState, Num, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { adminListUsers, type AdminUserRow } from "@/lib/platform-admin.functions";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/platform/users")({
  component: PlatformUsersPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المستخدمون | إدارة ركيز" },
      {
        name: "description",
        content: "دليل مستخدمي منصة ركيز لمدير النظام: الاسم والبريد والجوال وحالة الهوية واكتمال التسجيل وآخر دخول.",
      },
      { property: "og:title", content: "المستخدمون | إدارة ركيز" },
      { property: "og:description", content: "دليل مستخدمي منصة ركيز لمدير النظام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const IDENTITY_AR: Record<string, string> = {
  pending: "تحقق صيغة",
  verified: "موثّقة",
  rejected: "مرفوضة",
};

function identityLabel(row: AdminUserRow) {
  if (!row.identity_status) return "غير مرتبطة";
  return IDENTITY_AR[row.identity_status] ?? row.identity_status;
}

function PlatformUsersPage() {
  const fetchUsers = useServerFn(adminListUsers);
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["admin-users", q, page],
    queryFn: () => fetchUsers({ data: { q, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const forbidden = (query.error as Error | null)?.message === "FORBIDDEN";

  return (
    <div className="space-y-6">
      <PageHero title="المستخدمون" subtitle="دليل حسابات المنصة — للاطلاع الإداري فقط دون بيانات حساسة." />

      <SectionCard icon={Users} title="بحث وقائمة" count={total}>
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
            placeholder="الاسم أو البريد أو الجوال أو آخر 4 أرقام من الهوية"
            className="h-11"
            aria-label="بحث المستخدمين"
          />
          <Button type="submit" className="min-h-11 gap-2">
            <Search className="size-4" aria-hidden="true" />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <CardsSkeleton count={4} />
        ) : query.isError ? (
          <ErrorState
            description={forbidden ? "هذه القائمة متاحة لمدير النظام فقط." : (query.error as Error).message}
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={Users} title="لا توجد نتائج" description="جرّب مصطلح بحث آخر." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-start">
                  <tr>
                    {["الاسم", "البريد", "الجوال", "البريد مؤكد", "الحساب مكتمل", "الهوية", "آخر دخول"].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id} className="border-t border-border">
                      <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Num>{r.email ?? "—"}</Num>
                      </td>
                      <td className="px-3 py-2">
                        <Num>{r.phone ?? "—"}</Num>
                      </td>
                      <td className="px-3 py-2">{r.email_confirmed ? "نعم" : "لا"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.registration_complete ? "default" : "secondary"}>
                          {r.registration_complete ? "مكتمل" : "غير مكتمل"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {identityLabel(r)}
                        {r.identity_last4 ? (
                          <>
                            {" "}
                            <Num className="text-muted-foreground">{`****${r.identity_last4}`}</Num>
                          </>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Num>{r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : "—"}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.user_id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{r.full_name ?? "—"}</span>
                    <Badge variant={r.registration_complete ? "default" : "secondary"}>
                      {r.registration_complete ? "مكتمل" : "غير مكتمل"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Num>{r.email ?? "—"}</Num>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الجوال: <Num>{r.phone ?? "—"}</Num> · البريد مؤكد: {r.email_confirmed ? "نعم" : "لا"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الهوية: {identityLabel(r)}
                    {r.identity_last4 ? <Num>{` ****${r.identity_last4}`}</Num> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    آخر دخول: <Num>{r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : "—"}</Num>
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                <BadgeCheck className="me-1 inline size-3" aria-hidden="true" />
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
