import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Fingerprint, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/rakeez";
import { Num } from "@/components/rakeez/numeric";
import {
  getIdentityVisibility,
  getProjectIdentity,
  getPropertyIdentity,
  listIdentityAudienceParties,
  setIdentityVisibility,
  IDENTITY_GROUPS,
  IDENTITY_GROUP_LABELS,
  IDENTITY_LEVELS,
  IDENTITY_LEVEL_LABELS,
  type IdentityGroup,
  type IdentityLevel,
  type UnifiedIdentity,
} from "@/lib/project-identity.functions";

/**
 * Unified identity of a project (or a property, through its primary project).
 *
 * Read-only. Every value is resolved live by the database from its original
 * source; groups the caller may not see never reach this component.
 */

const MISSING = "غير مكتمل";

const ROLE_AR: Record<string, string> = {
  design_office: "مكتب تصميم",
  supervision: "إشراف",
  contractor: "مقاول",
  inspector: "فاحص",
  insurance: "تأمين",
  accounting: "محاسبة",
  legal: "قانوني",
  supplier: "مورّد",
};

const KIND_AR: Record<string, string> = { person: "شخص", entity: "منشأة" };

const STATUS_AR: Record<string, string> = {
  accepted: "مقبول",
  invited: "مدعو",
  rejected: "مرفوض",
  ended: "منتهٍ",
  cancelled: "ملغى",
  verified: "موثّق",
  pending: "قيد التوثيق",
};

function Value({ children }: { children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <span
      className={
        empty ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium text-foreground"
      }
    >
      {empty ? MISSING : children}
    </span>
  );
}

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Value>{children}</Value>
    </div>
  );
}

/** Person identifiers are shown as last4 only; entity numbers as stored. */
function identifierText(p: {
  identifier_kind: string | null;
  identifier_value: string | null;
  is_full_identifier: boolean;
}): React.ReactNode {
  if (!p.identifier_value) return null;
  const label =
    p.identifier_kind === "cr_number"
      ? "س.ت"
      : p.identifier_kind === "unified_number"
        ? "الرقم الموحد"
        : "الهوية";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Num>{p.is_full_identifier ? p.identifier_value : `••••${p.identifier_value}`}</Num>
    </span>
  );
}

function PartyRows({
  items,
  withRole,
}: {
  items: NonNullable<UnifiedIdentity["groups"]["contracted_parties"]>;
  withRole?: boolean;
}) {
  if (items.length === 0)
    return <p className="py-2 text-xs text-muted-foreground">{MISSING}</p>;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((p, i) => (
        <li key={p.id ?? i} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{p.name ?? MISSING}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[
                KIND_AR[p.kind ?? ""] ?? p.kind,
                withRole ? (ROLE_AR[p.role ?? ""] ?? p.role) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {identifierText(p)}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {STATUS_AR[p.status ?? ""] ?? p.status ?? MISSING}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- visibility ------------------------------- */

function VisibilityManager({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getIdentityVisibility);
  const fetchParties = useServerFn(listIdentityAudienceParties);
  const save = useServerFn(setIdentityVisibility);

  const settingsQuery = useQuery({
    queryKey: ["identity-visibility", projectId],
    queryFn: () => fetchSettings({ data: { projectId } }),
  });
  const partiesQuery = useQuery({
    queryKey: ["identity-audience-parties", projectId],
    queryFn: () => fetchParties({ data: { projectId } }),
  });

  const [draft, setDraft] = React.useState<
    Record<IdentityGroup, { level: IdentityLevel; partyIds: string[] }>
  >(() =>
    Object.fromEntries(
      IDENTITY_GROUPS.map((g) => [g, { level: "internal" as IdentityLevel, partyIds: [] }]),
    ) as Record<IdentityGroup, { level: IdentityLevel; partyIds: string[] }>,
  );

  React.useEffect(() => {
    const rows = settingsQuery.data?.settings;
    if (!rows) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.field_group] = { level: row.level, partyIds: row.party_ids };
      return next;
    });
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      for (const group of IDENTITY_GROUPS) {
        const value = draft[group];
        await save({
          data: {
            projectId,
            fieldGroup: group,
            level: value.level,
            partyIds: value.partyIds,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات ظهور الهوية");
      void queryClient.invalidateQueries({ queryKey: ["unified-identity"] });
      void queryClient.invalidateQueries({ queryKey: ["identity-visibility", projectId] });
      onClose();
    },
    onError: () => toast.error("تعذّر حفظ الإعدادات. حاول مرة أخرى."),
  });

  const parties = partiesQuery.data ?? [];

  return (
    <div className="space-y-4">
      {settingsQuery.isPending ? (
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted/50" />
      ) : (
        IDENTITY_GROUPS.map((group) => {
          const value = draft[group];
          return (
            <div key={group} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {IDENTITY_GROUP_LABELS[group]}
                </span>
                <select
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  value={value.level}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [group]: { ...prev[group], level: e.target.value as IdentityLevel },
                    }))
                  }
                >
                  {IDENTITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {IDENTITY_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </div>

              {value.level === "selected_parties" ? (
                parties.length ? (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {parties.map((party) => {
                      const checked = value.partyIds.includes(party.id);
                      return (
                        <li key={party.id}>
                          <label className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-secondary">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={checked}
                              onChange={() =>
                                setDraft((prev) => {
                                  const ids = new Set(prev[group].partyIds);
                                  if (checked) ids.delete(party.id);
                                  else ids.add(party.id);
                                  return {
                                    ...prev,
                                    [group]: { ...prev[group], partyIds: [...ids] },
                                  };
                                })
                              }
                            />
                            <span className="min-w-0 truncate">
                              {party.display_name}
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                · {ROLE_AR[party.party_role] ?? party.party_role}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    لا توجد أطراف مقبولة في المشروع بعد.
                  </p>
                )
              ) : null}
            </div>
          );
        })
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
          إلغاء
        </Button>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="min-h-11"
        >
          {mutation.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- section -------------------------------- */

export function UnifiedIdentitySection(
  props:
    | { projectId: string; propertyId?: undefined }
    | { propertyId: string; projectId?: undefined },
) {
  const projectId = props.projectId ?? null;
  const propertyId = props.propertyId ?? null;
  const fetchProject = useServerFn(getProjectIdentity);
  const fetchProperty = useServerFn(getPropertyIdentity);

  const [open, setOpen] = React.useState(false);
  const [manage, setManage] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  const query = useQuery({
    queryKey: ["unified-identity", projectId ?? `property:${propertyId}`],
    queryFn: () =>
      projectId
        ? fetchProject({ data: { projectId } })
        : fetchProperty({ data: { propertyId: propertyId as string } }),
    retry: false,
  });

  if (query.isPending) {
    return <div className="h-16 w-full animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
        {propertyId ? "هوية العقار الموحدة" : "هوية المشروع الموحدة"} محجوبة — لا تملك صلاحية
        الاطلاع عليها.
      </div>
    );
  }

  const data = query.data;
  const g = data.groups;
  const title = propertyId ? "هوية العقار الموحدة" : "هوية المشروع الموحدة";
  const owners = g.ownership ?? [];
  const manageProjectId = data.project_id ?? data.primary_project_id ?? null;

  const summary = [
    owners[0]?.name ?? MISSING,
    g.deed_license?.deed_number ? `صك ${g.deed_license.deed_number}` : null,
    g.parcel_plan?.parcel_no ? `قطعة ${g.parcel_plan.parcel_no}` : null,
    (g.contractor ?? [])[0]?.name ?? null,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border bg-card px-4 py-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Fingerprint className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {summary.length ? summary.join(" · ") : "لا توجد بيانات هوية متاحة لك."}
          </p>
        </div>
        {data.can_manage && manageProjectId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            onClick={() => setManage(true)}
          >
            <Settings2 className="size-4" aria-hidden="true" />
            إدارة ظهور الهوية
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-9"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {open ? "إخفاء التفاصيل" : "عرض التفاصيل"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {propertyId && data.linked_projects.length ? (
            <div className="md:col-span-2">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">المشاريع المرتبطة</p>
              <ul className="flex flex-wrap gap-2">
                {data.linked_projects.map((p) => (
                  <li key={p.project_id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.project_id }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-primary"
                    >
                      {p.name ?? "مشروع"}
                      {p.project_id === data.primary_project_id ? (
                        <span className="text-muted-foreground">· الأساسي</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {g.ownership ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">الملكية</p>
              {owners.length ? (
                <ul className="divide-y divide-border/60">
                  {owners.map((o, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {o.name ?? MISSING}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[KIND_AR[o.kind ?? ""] ?? o.kind, o.legal_form].filter(Boolean).join(" · ") ||
                            MISSING}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {identifierText(o)}
                        {o.share_percent != null ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <Num>{String(o.share_percent)}</Num>%
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-xs text-muted-foreground">{MISSING}</p>
              )}
            </div>
          ) : null}

          {g.deed_license || g.parcel_plan || g.precise_location ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                الصك والرخصة والقطعة
              </p>
              {g.deed_license ? (
                <>
                  <Row label="رقم الصك">
                    {g.deed_license.deed_number ? <Num>{g.deed_license.deed_number}</Num> : null}
                  </Row>
                  <Row label="رقم الرخصة">
                    {g.deed_license.license_number ? (
                      <Num>{g.deed_license.license_number}</Num>
                    ) : null}
                  </Row>
                </>
              ) : null}
              {g.parcel_plan ? (
                <>
                  <Row label="رقم القطعة">
                    {g.parcel_plan.parcel_no ? <Num>{g.parcel_plan.parcel_no}</Num> : null}
                  </Row>
                  <Row label="رقم المخطط">
                    {g.parcel_plan.plan_no ? <Num>{g.parcel_plan.plan_no}</Num> : null}
                  </Row>
                </>
              ) : null}
              {g.precise_location ? (
                <Row label="الموقع الدقيق">
                  {g.precise_location.complete ? (g.precise_location.address ?? "محدد") : null}
                </Row>
              ) : null}
            </div>
          ) : null}

          {g.contractor ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">المقاول</p>
              <PartyRows items={g.contractor} />
            </div>
          ) : null}

          {g.contracted_parties ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">الأطراف المتعاقدة</p>
              <PartyRows items={g.contracted_parties} withRole />
            </div>
          ) : null}
        </div>
      ) : null}

      {manageProjectId ? (
        <ResponsiveModal
          open={manage}
          onOpenChange={setManage}
          title="إدارة ظهور الهوية"
          description="حدّد من يرى كل مجموعة حقول. الافتراضي داخلي فقط، والظهور قيد إضافي لا يوسّع الصلاحيات."
          className="sm:max-w-xl"
        >
          <VisibilityManager projectId={manageProjectId} onClose={() => setManage(false)} />
        </ResponsiveModal>
      ) : null}
    </section>
  );
}
