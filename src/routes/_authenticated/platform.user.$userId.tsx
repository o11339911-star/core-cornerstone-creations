import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Building2, ShieldCheck, UserSearch } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  Field,
  FieldGrid,
  Num,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { adminGetUser, type AdminUserDetail } from "@/lib/platform-admin.functions";
import { formatDateTime } from "@/lib/format";

const searchSchema = z.object({ hint: z.string().max(160).optional() });

export const Route = createFileRoute("/_authenticated/platform/user/$userId")({
  component: PlatformUserDetailPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "تفاصيل المستخدم | إدارة ركيز" },
      {
        name: "description",
        content: "صفحة إدارية لمدير منصة ركيز تعرض بيانات المستخدم الآمنة وعضوياته في الكيانات وحالة حسابه.",
      },
      { property: "og:title", content: "تفاصيل المستخدم | إدارة ركيز" },
      { property: "og:description", content: "بيانات المستخدم الإدارية وعضويات الكيانات." },
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

const MEMBER_STATUS_AR: Record<string, string> = {
  active: "نشطة",
  pending: "بانتظار القبول",
  revoked: "ملغاة",
  expired: "منتهية",
};

function Crumbs({ label }: { label: string }) {
  return (
    <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-2 text-sm">
      <Link to="/platform/users" className="text-muted-foreground hover:text-primary">
        المستخدمون
      </Link>
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <span className="font-medium text-foreground">{label}</span>
    </nav>
  );
}

function PlatformUserDetailPage() {
  const { userId } = Route.useParams();
  const { hint } = Route.useSearch();
  const fetchUser = useServerFn(adminGetUser);

  const query = useQuery({
    queryKey: ["admin-user", userId, hint ?? ""],
    queryFn: () => fetchUser({ data: { id: userId, ...(hint ? { hint } : {}) } }),
  });

  const message = (query.error as Error | null)?.message;
  const user: AdminUserDetail | undefined = query.data;

  return (
    <div className="space-y-6">
      <Crumbs label={user?.full_name ?? "تفاصيل المستخدم"} />

      <PageHero
        title={user?.full_name ?? "تفاصيل المستخدم"}
        subtitle="عرض إداري للبيانات الآمنة فقط — دون كلمات مرور أو رموز أو بيانات حسّاسة."
      />

      <Button asChild variant="outline" className="min-h-11 gap-2">
        <Link to="/platform/users">
          <ArrowRight className="size-4" aria-hidden="true" />
          رجوع إلى المستخدمين
        </Link>
      </Button>

      {query.isPending ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : query.isError ? (
        <ErrorState
          description={
            message === "FORBIDDEN"
              ? "هذه الصفحة متاحة لمدير النظام فقط."
              : message === "NOT_FOUND"
                ? "لم يعد هذا المستخدم متاحًا في الدليل الإداري."
                : "تعذّر جلب بيانات المستخدم. حاول مرة أخرى."
          }
          onRetry={() => void query.refetch()}
        />
      ) : user ? (
        <>
          <SectionCard icon={UserSearch} title="بيانات الحساب">
            <FieldGrid>
              <Field label="الاسم" value={user.full_name ?? "—"} />
              <Field label="البريد" value={<Num>{user.email ?? "—"}</Num>} />
              <Field label="الجوال" value={<Num>{user.phone ?? "—"}</Num>} />
              <Field label="البريد مؤكد" value={user.email_confirmed ? "نعم" : "لا"} />
              <Field
                label="اكتمال التسجيل"
                value={
                  user.registration_complete === undefined
                    ? "غير متاح"
                    : user.registration_complete
                      ? "مكتمل"
                      : "غير مكتمل"
                }
              />
              <Field
                label="الهوية"
                value={
                  <span>
                    {user.identity_status
                      ? (IDENTITY_AR[user.identity_status] ?? user.identity_status)
                      : "غير مرتبطة"}
                    {user.identity_last4 ? <Num className="ms-1">{`****${user.identity_last4}`}</Num> : null}
                  </span>
                }
              />
              <Field
                label="تاريخ الإنشاء"
                value={<Num>{user.created_at ? formatDateTime(user.created_at) : "—"}</Num>}
              />
              <Field
                label="آخر دخول"
                value={<Num>{user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "—"}</Num>}
              />
            </FieldGrid>
          </SectionCard>

          <SectionCard
            icon={Building2}
            title="عضويات الكيانات"
            count={user.memberships.length || user.active_memberships || 0}
          >
            {user.memberships.length === 0 ? (
              <SoftEmpty
                icon={Building2}
                message={
                  user.source === "directory"
                    ? "تفاصيل العضويات تحتاج تفعيل التحديث الإداري لقاعدة البيانات — يظهر حاليًا العدد فقط."
                    : "لا توجد عضويات كيانات لهذا المستخدم."
                }
              />
            ) : (
              <ul className="space-y-2">
                {user.memberships.map((m) => (
                  <li key={m.membership_id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/platform/entity/$entityId"
                        params={{ entityId: m.entity_id }}
                        search={{ hint: m.entity_name ?? "" }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {m.entity_name ?? "كيان"}
                      </Link>
                      <Badge variant={m.status === "active" ? "default" : "secondary"}>
                        {m.status ? (MEMBER_STATUS_AR[m.status] ?? m.status) : "—"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      الدور: {m.role ?? "—"} · الانضمام:{" "}
                      <Num>{m.created_at ? formatDateTime(m.created_at) : "—"}</Num>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="ملاحظة الخصوصية">
            <p className="text-sm text-muted-foreground">
              هذه الصفحة للاطلاع والإدارة على مستوى البيانات فقط، ولا تتيح الدخول بحساب المستخدم أو تجاوز
              قواعد العزل بين الحسابات والكيانات.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
