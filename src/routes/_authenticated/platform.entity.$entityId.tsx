import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Building2, ShieldCheck, Users } from "lucide-react";
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
import { adminGetEntity, type AdminEntityDetail } from "@/lib/platform-admin.functions";
import { formatDateTime } from "@/lib/format";

const searchSchema = z.object({ hint: z.string().max(160).optional() });

export const Route = createFileRoute("/_authenticated/platform/entity/$entityId")({
  component: PlatformEntityDetailPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "تفاصيل الكيان | إدارة ركيز" },
      {
        name: "description",
        content: "صفحة إدارية لمدير منصة ركيز تعرض بيانات الكيان وحالة توثيقه وأعضاءه وأدوارهم.",
      },
      { property: "og:title", content: "تفاصيل الكيان | إدارة ركيز" },
      { property: "og:description", content: "بيانات الكيان الإدارية وأعضاؤه." },
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
  expired: "منتهية",
};

function PlatformEntityDetailPage() {
  const { entityId } = Route.useParams();
  const { hint } = Route.useSearch();
  const fetchEntity = useServerFn(adminGetEntity);

  const query = useQuery({
    queryKey: ["admin-entity", entityId, hint ?? ""],
    queryFn: () => fetchEntity({ data: { id: entityId, ...(hint ? { hint } : {}) } }),
  });

  const message = (query.error as Error | null)?.message;
  const entity: AdminEntityDetail | undefined = query.data;

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
        subtitle="عرض إداري لبيانات الكيان وأعضائه — دون تجاوز العزل بين الحسابات."
        aside={
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to="/platform/entities">
              <ArrowRight className="size-4" aria-hidden="true" />
              رجوع إلى الكيانات
            </Link>
          </Button>
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

          <SectionCard
            icon={Users}
            title="الأعضاء"
            count={entity.members.length || entity.members_count || 0}
          >
            {entity.members.length === 0 ? (
              <SoftEmpty
                icon={Users}
                message={
                  entity.source === "directory"
                    ? "قائمة الأعضاء تحتاج تفعيل التحديث الإداري لقاعدة البيانات — يظهر حاليًا العدد فقط."
                    : "لا يوجد أعضاء مسجّلون في هذا الكيان."
                }
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
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="ملاحظة الخصوصية">
            <p className="text-sm text-muted-foreground">
              لا تمنح هذه الصفحة أي وصول لملفات مشاريع الكيان أو مستنداته، بل بيانات إدارية فقط.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
