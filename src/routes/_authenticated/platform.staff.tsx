import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CircleSlash, Coffee, UserCheck, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { listPlatformStaff, setStaffState } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/platform/staff")({
  component: PlatformStaffPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "فريق المنصة | إدارة ركيز" },
      {
        name: "description",
        content:
          "أدوار موظفي منصة ركيز وحالاتهم التشغيلية وحدودهم القصوى للمهام المتزامنة، منفصلة تمامًا عن عضويات الكيانات.",
      },
      { property: "og:title", content: "فريق المنصة | إدارة ركيز" },
      {
        property: "og:description",
        content: "إدارة توفر موظفي التشغيل والحد الأقصى للمهام المتزامنة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ROLE_AR: Record<string, string> = {
  superadmin: "مشرف عام",
  reviewer: "موظف مراجعة",
  support: "موظف دعم",
  compliance: "موظف التزام",
};

const AVAIL_AR: Record<string, string> = {
  available: "متاح",
  busy: "مشغول",
  on_leave: "إجازة",
  suspended: "موقوف عن الإسناد",
};

const AVAILABILITIES = ["available", "busy", "on_leave", "suspended"] as const;

function PlatformStaffPage() {
  const qc = useQueryClient();
  const fetchStaff = useServerFn(listPlatformStaff);
  const setState = useServerFn(setStaffState);

  const staff = useQuery({ queryKey: ["platform-staff"], queryFn: () => fetchStaff() });

  const mut = useMutation({
    mutationFn: (v: { userId: string; availability: (typeof AVAILABILITIES)[number] }) =>
      setState({ data: v }),
    onSuccess: () => {
      toast.success("حُدِّثت حالة الموظف");
      void qc.invalidateQueries({ queryKey: ["platform-staff"] });
      void qc.invalidateQueries({ queryKey: ["platform-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = staff.data ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="فريق تشغيل المنصة"
        subtitle="أدوار وحالات موظفي ركيز — منفصلة تمامًا عن عضويات الكيانات وأدوار المشاريع."
      />

      <StatGrid>
        <StatCard icon={Users} label="إجمالي الفريق" value={rows.length} tone="primary" />
        <StatCard
          icon={UserCheck}
          label="متاحون"
          value={rows.filter((r) => r.availability === "available").length}
          tone="success"
        />
        <StatCard
          icon={Coffee}
          label="إجازة"
          value={rows.filter((r) => r.availability === "on_leave").length}
          tone="warning"
        />
        <StatCard
          icon={CircleSlash}
          label="موقوفون عن الإسناد"
          value={rows.filter((r) => r.availability === "suspended").length}
          tone="warning"
        />
        <StatCard
          icon={UserCheck}
          label="إجمالي الحِمل الحالي"
          value={rows.reduce((s, r) => s + r.current_load, 0)}
          tone="info"
        />
      </StatGrid>

      <SectionCard icon={Users} title="الموظفون" count={rows.length}>
        {staff.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : staff.isError ? (
          <ErrorState description={(staff.error as Error).message} />
        ) : rows.length === 0 ? (
          <SoftEmpty
            icon={Users}
            message="لا يوجد موظفو منصة مسجّلون — يقرر مالك المنصة إضافتهم."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((s) => (
              <li
                key={s.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {s.full_name ?? s.user_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_AR[s.role] ?? s.role} · الحِمل {s.current_load}/{s.max_concurrent}
                  </p>
                </div>
                <select
                  aria-label={`حالة ${s.full_name ?? "الموظف"}`}
                  value={s.availability}
                  onChange={(e) =>
                    mut.mutate({
                      userId: s.user_id,
                      availability: e.target.value as (typeof AVAILABILITIES)[number],
                    })
                  }
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {AVAILABILITIES.map((a) => (
                    <option key={a} value={a}>
                      {AVAIL_AR[a]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
