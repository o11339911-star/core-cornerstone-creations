import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { ArrowRight, Building2, Eye, ShieldCheck, Trash2, UserCog, UserSearch } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminAction,
  ErrorState,
  Field,
  FieldGrid,
  Num,
  PageHero,
  RefreshAction,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { adminGetUser, type AdminUserDetail } from "@/lib/platform-admin.functions";
import {
  adminAddMembership,
  adminDeleteUser,
  adminEvaluateUserErasure,
  adminRevealIdentity,
  adminSetMembership,
  adminSetUserSuspension,
  adminUpdateUserProfile,
} from "@/lib/platform-manage.functions";
import { formatDateTime } from "@/lib/format";

const searchSchema = z.object({ hint: z.string().max(160).optional() });

export const Route = createFileRoute("/_authenticated/platform/user/$userId")({
  component: PlatformUserDetailPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "إدارة المستخدم | إدارة ركيز" },
      {
        name: "description",
        content: "صفحة إدارية كاملة لمدير منصة ركيز: بيانات المستخدم وعضوياته وتجميد الحساب وحذفه بمسار محوكم.",
      },
      { property: "og:title", content: "إدارة المستخدم | إدارة ركيز" },
      { property: "og:description", content: "إدارة كاملة لبيانات المستخدم وعضوياته مع تسجيل كل فعل في التدقيق." },
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
  suspended: "مجمّدة",
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
  const queryClient = useQueryClient();

  const fetchUser = useServerFn(adminGetUser);
  const revealIdentity = useServerFn(adminRevealIdentity);
  const updateProfile = useServerFn(adminUpdateUserProfile);
  const setSuspension = useServerFn(adminSetUserSuspension);
  const setMembership = useServerFn(adminSetMembership);
  const addMembership = useServerFn(adminAddMembership);
  const evaluateErasure = useServerFn(adminEvaluateUserErasure);
  const deleteUser = useServerFn(adminDeleteUser);

  const query = useQuery({
    queryKey: ["admin-user", userId, hint ?? ""],
    queryFn: () => fetchUser({ data: { id: userId, ...(hint ? { hint } : {}) } }),
  });

  const message = (query.error as Error | null)?.message;
  const user: AdminUserDetail | undefined = query.data;

  const [identity, setIdentity] = React.useState<string | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [role, setRole] = React.useState("");
  const [erasure, setErasure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="space-y-6">
      <Crumbs label={user?.full_name ?? "تفاصيل المستخدم"} />

      <PageHero
        title={user?.full_name ?? "تفاصيل المستخدم"}
        subtitle="إدارة كاملة لبيانات الحساب — كل فعل يُسجَّل في سجل التدقيق."
        aside={
          <div className="flex flex-wrap gap-2">
            <RefreshAction onRefresh={() => void query.refetch()} busy={query.isFetching} />
            <Button asChild variant="outline" className="min-h-11 gap-2">
              <Link to="/platform/users">
                <ArrowRight className="size-4" aria-hidden="true" />
                رجوع إلى المستخدمين
              </Link>
            </Button>
          </div>
        }
      />

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
                  <span className="flex flex-wrap items-center gap-2">
                    {user.identity_status
                      ? (IDENTITY_AR[user.identity_status] ?? user.identity_status)
                      : "غير مرتبطة"}
                    <Num>
                      {identity ?? (user.identity_last4 ? `****${user.identity_last4}` : "—")}
                    </Num>
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

            <div className="mt-4 flex flex-wrap gap-2">
              <AdminAction
                label={identity ? "كشف رقم الهوية مجددًا" : "كشف رقم الهوية كاملًا"}
                title="كشف رقم الهوية"
                impact="سيظهر رقم الهوية كاملًا لك، ويُسجَّل الكشف باسمك ووقته في سجل التدقيق."
                confirmLabel="كشف الرقم"
                onConfirm={async (reason) => {
                  const res = await revealIdentity({ data: { userId, reason } });
                  if ("identity" in res && res.ok) {
                    setIdentity(res.identity ?? "غير متاح");
                    return { ok: true, message: "تم الكشف وتسجيله في سجل التدقيق." };
                  }
                  return { ok: false, message: "message" in res ? res.message : undefined };
                }}
              />
            </div>
          </SectionCard>

          <SectionCard icon={UserCog} title="تحديث البيانات">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="admin-user-name">الاسم</Label>
                <Input
                  id="admin-user-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-user-phone">الجوال</Label>
                <Input
                  id="admin-user-phone"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              تغيير البريد يتم عبر المسار الرسمي للحساب فقط، ولا يُعدَّل من هنا.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminAction
                label="حفظ التعديلات"
                title="تحديث بيانات المستخدم"
                impact="سيُحدَّث الاسم والجوال في ملف المستخدم مباشرة، ويُسجَّل التغيير في التدقيق."
                confirmLabel="حفظ"
                onConfirm={async (reason) => {
                  const res = await updateProfile({
                    data: { userId, fullName, phone, reason },
                  });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="تجميد الحساب"
                title="تجميد حساب المستخدم"
                impact="سيُمنع المستخدم من الدخول إلى المنصة والتصرف باسم أي كيان حتى فك التجميد."
                confirmLabel="تجميد"
                destructive
                onConfirm={async (reason) => {
                  const res = await setSuspension({ data: { userId, suspended: true, reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="فك التجميد"
                title="فك تجميد الحساب"
                impact="سيستعيد المستخدم القدرة على الدخول والتصرف وفق صلاحياته السابقة."
                confirmLabel="فك التجميد"
                onConfirm={async (reason) => {
                  const res = await setSuspension({ data: { userId, suspended: false, reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Building2}
            title="عضويات الكيانات"
            count={user.memberships.length || user.active_memberships || 0}
          >
            {user.memberships.length === 0 ? (
              <SoftEmpty
                icon={Building2}
                message="لا توجد عضويات كيانات لهذا المستخدم."
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AdminAction
                        label="تغيير الدور"
                        title="تغيير دور العضوية"
                        impact="سيتغير دور المستخدم داخل هذا الكيان وتتغير صلاحياته فورًا."
                        confirmLabel="تغيير"
                        onConfirm={async (reason) => {
                          const res = await setMembership({
                            data: { membershipId: m.membership_id, role: role || (m.role ?? "member"), reason },
                          });
                          return { ok: res.ok, message: "message" in res ? res.message : undefined };
                        }}
                        onDone={invalidate}
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor={`role-${m.membership_id}`}>الدور الجديد</Label>
                          <Input
                            id={`role-${m.membership_id}`}
                            value={role}
                            placeholder={m.role ?? "member"}
                            onChange={(e) => setRole(e.target.value)}
                          />
                        </div>
                      </AdminAction>
                      <AdminAction
                        label="تجميد العضوية"
                        title="تجميد عضوية الكيان"
                        impact="سيتوقف المستخدم عن التصرف باسم هذا الكيان مع بقاء حسابه فعّالًا."
                        confirmLabel="تجميد"
                        destructive
                        onConfirm={async (reason) => {
                          const res = await setMembership({
                            data: { membershipId: m.membership_id, status: "suspended", reason },
                          });
                          return { ok: res.ok, message: "message" in res ? res.message : undefined };
                        }}
                        onDone={invalidate}
                      />
                      <AdminAction
                        label="إلغاء العضوية"
                        title="إلغاء عضوية الكيان"
                        impact="ستُلغى العضوية نهائيًا ويفقد المستخدم وصوله إلى بيانات هذا الكيان."
                        confirmLabel="إلغاء العضوية"
                        destructive
                        onConfirm={async (reason) => {
                          const res = await setMembership({
                            data: { membershipId: m.membership_id, status: "revoked", reason },
                          });
                          return { ok: res.ok, message: "message" in res ? res.message : undefined };
                        }}
                        onDone={invalidate}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <AdminAction
                label="إضافة عضوية"
                title="إضافة عضوية كيان"
                impact="ستُضاف عضوية نشطة للمستخدم في الكيان المحدد بالدور المكتوب."
                confirmLabel="إضافة"
                onConfirm={async (reason) => {
                  if (!entityId.trim() || !role.trim()) {
                    return { ok: false, message: "أدخل معرّف الكيان والدور." };
                  }
                  const res = await addMembership({
                    data: { userId, entityId: entityId.trim(), role: role.trim(), reason },
                  });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-entity">معرّف الكيان</Label>
                    <Input
                      id="add-entity"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      placeholder="UUID"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-role">الدور</Label>
                    <Input id="add-role" value={role} onChange={(e) => setRole(e.target.value)} />
                  </div>
                </div>
              </AdminAction>
            </div>
          </SectionCard>

          <SectionCard icon={Trash2} title="حذف الحساب — مسار محوكم">
            <p className="text-sm text-muted-foreground">
              يبدأ الحذف بفحص الالتزامات القائمة. إن كان الحذف الكامل ممنوعًا تظهر الأسباب ويبقى
              التجميد بديلًا نظاميًا.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={async () => {
                  const res = await evaluateErasure({ data: { userId } });
                  setErasure(
                    res.ok
                      ? JSON.stringify(res.data ?? {}, null, 2)
                      : "message" in res
                        ? res.message
                        : "تعذّر الفحص.",
                  );
                }}
              >
                <Eye className="size-4" aria-hidden="true" />
                فحص إمكانية الحذف
              </Button>
              <AdminAction
                label="حذف الحساب نهائيًا"
                title="حذف حساب المستخدم"
                impact="حذف نهائي للحساب بعد اجتياز فحص الالتزامات، مع إلغاء كل عضوياته. لا يمكن التراجع."
                confirmLabel="حذف نهائي"
                destructive
                confirmName={user.full_name ?? undefined}
                onConfirm={async (reason) => {
                  const res = await deleteUser({
                    data: { userId, reason, confirmName: user.full_name ?? "" },
                  });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
            </div>
            {erasure ? (
              <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-start text-xs">
                <Num>{erasure}</Num>
              </pre>
            ) : null}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="ملاحظة الخصوصية">
            <p className="text-sm text-muted-foreground">
              يملك مدير النظام إدارة كاملة لبيانات هذا الحساب، وكل اطلاع أو تعديل أو تجميد أو حذف
              يُسجَّل في سجل التدقيق باسم المنفّذ ووقته وسببه. لا تتيح الصفحة الدخول بحساب المستخدم
              ولا عرض كلمات المرور أو الرموز.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
