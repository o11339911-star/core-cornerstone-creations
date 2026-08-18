import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { ArrowRight, BadgeCheck, Building2, Eye, ShieldCheck, Trash2, Users } from "lucide-react";
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
import { adminGetEntity, type AdminEntityDetail } from "@/lib/platform-admin.functions";
import {
  adminAddMembership,
  adminDeleteEntity,
  adminEntityDependencies,
  adminSetEntitySuspension,
  adminSetEntityVerification,
  adminSetMembership,
  adminUpdateEntity,
} from "@/lib/platform-manage.functions";
import { formatDateTime } from "@/lib/format";

const searchSchema = z.object({ hint: z.string().max(160).optional() });

export const Route = createFileRoute("/_authenticated/platform/entity/$entityId")({
  component: PlatformEntityDetailPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "إدارة الكيان | إدارة ركيز" },
      {
        name: "description",
        content:
          "صفحة إدارية كاملة لمدير منصة ركيز: تحديث بيانات الكيان وتوثيقه وتجميده وإدارة أعضائه وحذفه بمسار محوكم.",
      },
      { property: "og:title", content: "إدارة الكيان | إدارة ركيز" },
      { property: "og:description", content: "إدارة كاملة لبيانات الكيان وأعضائه مع تسجيل التدقيق." },
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

const VERIFY_AR: Record<string, string> = {
  unverified: "غير موثّق",
  pending: "تحقق صيغة",
  verified: "موثّق",
  rejected: "مرفوض",
};

const MEMBER_STATUS_AR: Record<string, string> = {
  active: "نشطة",
  pending: "بانتظار القبول",
  revoked: "ملغاة",
  suspended: "مجمّدة",
  expired: "منتهية",
};

function PlatformEntityDetailPage() {
  const { entityId } = Route.useParams();
  const { hint } = Route.useSearch();
  const queryClient = useQueryClient();

  const fetchEntity = useServerFn(adminGetEntity);
  const updateEntity = useServerFn(adminUpdateEntity);
  const setVerification = useServerFn(adminSetEntityVerification);
  const setSuspension = useServerFn(adminSetEntitySuspension);
  const dependencies = useServerFn(adminEntityDependencies);
  const deleteEntity = useServerFn(adminDeleteEntity);
  const setMembership = useServerFn(adminSetMembership);
  const addMembership = useServerFn(adminAddMembership);

  const query = useQuery({
    queryKey: ["admin-entity", entityId, hint ?? ""],
    queryFn: () => fetchEntity({ data: { id: entityId, ...(hint ? { hint } : {}) } }),
  });

  const message = (query.error as Error | null)?.message;
  const entity: AdminEntityDetail | undefined = query.data;

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [memberUserId, setMemberUserId] = React.useState("");
  const [memberRole, setMemberRole] = React.useState("");
  const [deps, setDeps] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (entity) {
      setName(entity.name ?? "");
      setType(entity.type ?? "");
      setStatus(entity.status ?? "");
    }
  }, [entity]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-entity", entityId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
  };

  return (
    <div className="space-y-6">
      <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/platform/entities" className="text-muted-foreground hover:text-primary">
          الكيانات
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <span className="font-medium text-foreground">{entity?.name ?? "تفاصيل الكيان"}</span>
      </nav>

      <PageHero
        title={entity?.name ?? "تفاصيل الكيان"}
        subtitle="إدارة كاملة لبيانات الكيان وأعضائه — كل فعل يُسجَّل في سجل التدقيق."
        aside={
          <div className="flex flex-wrap gap-2">
            <RefreshAction onRefresh={() => void query.refetch()} busy={query.isFetching} />
            <Button asChild variant="outline" className="min-h-11 gap-2">
              <Link to="/platform/entities">
                <ArrowRight className="size-4" aria-hidden="true" />
                رجوع إلى الكيانات
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
                ? "لم يعد هذا الكيان متاحًا في الدليل الإداري."
                : "تعذّر جلب بيانات الكيان. حاول مرة أخرى."
          }
          onRetry={() => void query.refetch()}
        />
      ) : entity ? (
        <>
          <SectionCard icon={Building2} title="بيانات الكيان">
            <FieldGrid>
              <Field label="الاسم" value={entity.name} />
              <Field label="التصنيف" value={entity.type ? (TYPE_AR[entity.type] ?? entity.type) : "—"} />
              <Field label="الحالة" value={entity.status ?? "—"} />
              <Field label="الشكل النظامي" value={entity.legal_form ?? "غير محدد"} />
              <Field
                label="الرقم الموحّد"
                value={<Num>{entity.unified_national_number ?? "—"}</Num>}
              />
              <Field
                label="حالة التوثيق"
                value={
                  entity.verification_status
                    ? (VERIFY_AR[entity.verification_status] ?? entity.verification_status)
                    : "—"
                }
              />
              <Field label="المالك" value={entity.owner_name ?? "—"} />
              <Field
                label="تاريخ الإنشاء"
                value={<Num>{entity.created_at ? formatDateTime(entity.created_at) : "—"}</Num>}
              />
            </FieldGrid>
          </SectionCard>

          <SectionCard icon={BadgeCheck} title="تحديث البيانات والتوثيق">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="entity-name">الاسم</Label>
                <Input id="entity-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-type">التصنيف</Label>
                <Input id="entity-type" value={type} onChange={(e) => setType(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-status">الحالة</Label>
                <Input id="entity-status" value={status} onChange={(e) => setStatus(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <AdminAction
                label="حفظ التعديلات"
                title="تحديث بيانات الكيان"
                impact="ستُحدَّث بيانات الكيان مباشرة لكل أعضائه، ويُسجَّل التغيير في التدقيق."
                confirmLabel="حفظ"
                onConfirm={async (reason) => {
                  const res = await updateEntity({ data: { entityId, name, type, status, reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="توثيق الكيان"
                title="توثيق الكيان"
                impact="سيصبح الكيان موثّقًا وتظهر شارة التوثيق في واجهاته العامة."
                confirmLabel="توثيق"
                onConfirm={async (reason) => {
                  const res = await setVerification({ data: { entityId, status: "verified", reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="رفض التوثيق"
                title="رفض توثيق الكيان"
                impact="سيُعلَّم الكيان كمرفوض التوثيق وتختفي شارة التوثيق."
                confirmLabel="رفض"
                destructive
                onConfirm={async (reason) => {
                  const res = await setVerification({ data: { entityId, status: "rejected", reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="تجميد الكيان"
                title="تجميد الكيان"
                impact="سيتوقف كل أعضاء الكيان عن التصرف باسمه، وتُخفى واجهاته العامة."
                confirmLabel="تجميد"
                destructive
                onConfirm={async (reason) => {
                  const res = await setSuspension({ data: { entityId, suspended: true, reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
              <AdminAction
                label="فك تجميد الكيان"
                title="فك تجميد الكيان"
                impact="سيستعيد الكيان وأعضاؤه العمل الطبيعي."
                confirmLabel="فك التجميد"
                onConfirm={async (reason) => {
                  const res = await setSuspension({ data: { entityId, suspended: false, reason } });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Users}
            title="الأعضاء"
            count={entity.members.length || entity.members_count || 0}
          >
            {entity.members.length === 0 ? (
              <SoftEmpty
                icon={Users}
                message="لا يوجد أعضاء مسجّلون في هذا الكيان."
              />
            ) : (
              <ul className="space-y-2">
                {entity.members.map((m) => (
                  <li key={m.membership_id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {m.user_id ? (
                        <Link
                          to="/platform/user/$userId"
                          params={{ userId: m.user_id }}
                          search={{ hint: m.full_name ?? "" }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {m.full_name ?? "عضو"}
                        </Link>
                      ) : (
                        <span className="font-semibold">{m.full_name ?? "عضو"}</span>
                      )}
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
                        title="تغيير دور العضو"
                        impact="سيتغير دور العضو داخل الكيان وتتغير صلاحياته فورًا."
                        confirmLabel="تغيير"
                        onConfirm={async (reason) => {
                          const res = await setMembership({
                            data: {
                              membershipId: m.membership_id,
                              role: memberRole || (m.role ?? "member"),
                              reason,
                            },
                          });
                          return { ok: res.ok, message: "message" in res ? res.message : undefined };
                        }}
                        onDone={invalidate}
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor={`erole-${m.membership_id}`}>الدور الجديد</Label>
                          <Input
                            id={`erole-${m.membership_id}`}
                            value={memberRole}
                            placeholder={m.role ?? "member"}
                            onChange={(e) => setMemberRole(e.target.value)}
                          />
                        </div>
                      </AdminAction>
                      <AdminAction
                        label="إزالة العضو"
                        title="إزالة عضو من الكيان"
                        impact="ستُلغى عضويته ويفقد الوصول إلى بيانات هذا الكيان."
                        confirmLabel="إزالة"
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

            <div className="mt-4">
              <AdminAction
                label="إضافة عضو"
                title="إضافة عضو للكيان"
                impact="ستُضاف عضوية نشطة للمستخدم المحدد داخل هذا الكيان بالدور المكتوب."
                confirmLabel="إضافة"
                onConfirm={async (reason) => {
                  if (!memberUserId.trim() || !memberRole.trim()) {
                    return { ok: false, message: "أدخل معرّف المستخدم والدور." };
                  }
                  const res = await addMembership({
                    data: { userId: memberUserId.trim(), entityId, role: memberRole.trim(), reason },
                  });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="entity-add-user">معرّف المستخدم</Label>
                    <Input
                      id="entity-add-user"
                      value={memberUserId}
                      onChange={(e) => setMemberUserId(e.target.value)}
                      placeholder="UUID"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entity-add-role">الدور</Label>
                    <Input
                      id="entity-add-role"
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value)}
                    />
                  </div>
                </div>
              </AdminAction>
            </div>
          </SectionCard>

          <SectionCard icon={Trash2} title="حذف الكيان — مسار محوكم">
            <p className="text-sm text-muted-foreground">
              يُفحص الكيان أولًا بحثًا عن مشاريع أو التزامات قائمة. إن وُجدت يُمنع الحذف ويبقى
              التجميد بديلًا نظاميًا.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={async () => {
                  const res = await dependencies({ data: { entityId } });
                  setDeps(
                    res.ok
                      ? JSON.stringify(res.data ?? {}, null, 2)
                      : "message" in res
                        ? res.message
                        : "تعذّر الفحص.",
                  );
                }}
              >
                <Eye className="size-4" aria-hidden="true" />
                فحص الارتباطات
              </Button>
              <AdminAction
                label="حذف الكيان نهائيًا"
                title="حذف الكيان"
                impact="حذف نهائي للكيان وعضوياته بعد اجتياز فحص الارتباطات. لا يمكن التراجع."
                confirmLabel="حذف نهائي"
                destructive
                confirmName={entity.name ?? undefined}
                onConfirm={async (reason) => {
                  const res = await deleteEntity({
                    data: { entityId, reason, confirmName: entity.name ?? "" },
                  });
                  return { ok: res.ok, message: "message" in res ? res.message : undefined };
                }}
                onDone={invalidate}
              />
            </div>
            {deps ? (
              <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-start text-xs">
                <Num>{deps}</Num>
              </pre>
            ) : null}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="ملاحظة الخصوصية">
            <p className="text-sm text-muted-foreground">
              يملك مدير النظام إدارة كاملة لهذا الكيان، وكل تعديل أو توثيق أو تجميد أو حذف يُسجَّل في
              سجل التدقيق باسم المنفّذ ووقته وسببه. لا تُعرض بيانات اعتماد الأعضاء في أي حالة.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
