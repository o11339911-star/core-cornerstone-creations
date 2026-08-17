import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Users, XCircle } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  ResponsiveModal,
  SectionCard,
  SoftEmpty,
  TextField,
} from "@/components/rakeez";
import { formatDate } from "@/lib/format";
import {
  createAssignment,
  createExternalAssignment,
  lookupExternalMember,
  endProjectAssignment,
  getProjectTeamCapabilities,
  listAssignableMembers,
  listAssignableProjectParties,
  listAssignmentAudience,
  listProjectAssignments,
  updateProjectAssignment,
  VISIBILITY_LEVELS,
  type Assignment,
  type VisibilityLevel,
} from "@/lib/team.functions";
import { listProjectStages } from "@/lib/project-parties.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/team")({
  component: ProjectTeamPage,
  head: () => ({
    meta: [
      { title: "فريق المشروع — ركيز" },
      { name: "description", content: "إدارة فريق المشروع، الإسنادات، ومستويات الظهور." },
      { property: "og:title", content: "فريق المشروع — ركيز" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const VISIBILITY_ICON: Record<VisibilityLevel, typeof Eye> = {
  internal: EyeOff,
  limited: Eye,
  project_wide: Eye,
};


const PARTY_ROLE_KEY: Record<string, string> = {
  design_office: "projectParties.roles.design_office",
  supervision: "projectParties.roles.supervision",
  contractor: "projectParties.roles.contractor",
  inspector: "projectParties.roles.inspector",
  insurance: "projectParties.roles.insurance",
  accounting: "projectParties.roles.accounting",
  legal: "projectParties.roles.legal",
  supplier: "projectParties.roles.supplier",
};

/** multi-select لأطراف المشروع المقبولة فقط (الاسم والدور والنوع، بلا بيانات هوية). */
function PartyAudienceField({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const partiesFn = useServerFn(listAssignableProjectParties);
  const partiesQuery = useQuery({
    queryKey: ["assignable-parties", projectId],
    queryFn: () => partiesFn({ data: { projectId } }),
  });
  const parties = partiesQuery.data ?? [];

  return (
    <div className="space-y-2 rounded-md border border-input p-3">
      <p className="text-sm font-medium text-foreground">{t("projectTeam.audienceTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("projectTeam.audienceHint")}</p>
      {partiesQuery.isPending ? (
        <p className="text-xs text-muted-foreground">{t("projectTeam.audienceLoading")}</p>
      ) : parties.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("projectTeam.audienceEmpty")}</p>
      ) : (
        <ul className="space-y-1">
          {parties.map((party) => {
            const checked = value.includes(party.id);
            return (
              <li key={party.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, party.id]
                          : value.filter((id) => id !== party.id),
                      )
                    }
                  />
                  <span className="text-foreground">{party.display_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {party.party_kind === "person"
                      ? t("projectParties.kindPerson")
                      : t("projectParties.kindEntity")}
                    {" · "}
                    {t(PARTY_ROLE_KEY[party.party_role] ?? party.party_role)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddAssignmentModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const membersFn = useServerFn(listAssignableMembers);
  const stagesFn = useServerFn(listProjectStages);
  const createFn = useServerFn(createAssignment);
  const createExternalFn = useServerFn(createExternalAssignment);
  const lookupFn = useServerFn(lookupExternalMember);

  const membersQuery = useQuery({
    queryKey: ["assignable-members", projectId],
    queryFn: () => membersFn({ data: { projectId } }),
  });
  const stagesQuery = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => stagesFn({ data: { projectId } }),
  });

  const [memberKind, setMemberKind] = React.useState<"registered" | "external">("registered");
  const [identifier, setIdentifier] = React.useState("");
  const [externalName, setExternalName] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [jobTitleAr, setJobTitleAr] = React.useState("");
  const [jobTitleEn, setJobTitleEn] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [visibility, setVisibility] = React.useState<VisibilityLevel>("internal");
  const [error, setError] = React.useState<string | null>(null);

  const members = membersQuery.data ?? [];
  const stages = stagesQuery.data ?? [];
  const selectedMember = members.find((m) => m.userId === userId) ?? null;

  type LookupState =
    | { status: "idle" }
    | { status: "searching" }
    | { status: "invalid" }
    | { status: "throttled" }
    | { status: "registered"; displayName: string | null; last4: string }
    | { status: "unregistered"; last4: string };

  const [lookupState, setLookupState] = React.useState<LookupState>({ status: "idle" });

  const digits = identifier.replace(/[^0-9]/g, "").slice(0, 10);
  const identifierComplete = digits.length === 10 && /^[12]/.test(digits);

  React.useEffect(() => {
    if (memberKind !== "external") return;
    setLookupState({ status: "idle" });
    setExternalName("");
    if (!identifierComplete) return;
    let cancelled = false;
    setLookupState({ status: "searching" });
    const timer = window.setTimeout(() => {
      void lookupFn({ data: { projectId, identifier: digits } })
        .then((result) => {
          if (cancelled) return;
          setLookupState(result as LookupState);
          if (result.status === "registered" && result.displayName) {
            setExternalName(result.displayName);
          }
        })
        .catch(() => {
          if (!cancelled) setLookupState({ status: "invalid" });
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [digits, identifierComplete, memberKind, projectId, lookupFn]);

  React.useEffect(() => {
    if (memberKind !== "registered" || !selectedMember) return;
    setJobTitleAr((prev) => prev || selectedMember.fullName);
  }, [memberKind, selectedMember]);

  const mutation = useMutation({
    mutationFn: () => {
      if (memberKind === "external") {
        return createExternalFn({
          data: {
            projectId,
            identifier: digits,
            displayName: externalName.trim() || null,
            jobTitleAr: jobTitleAr.trim(),
            jobTitleEn: jobTitleEn.trim(),
            stageId: stageId || null,
            startsOn: startsOn || null,
            endsOn: endsOn || null,
            visibility,
          },
        }).then(() => undefined);
      }
      if (!selectedMember) throw new Error(t("projectTeam.selectMember"));
      return createFn({
        data: {
          projectId,
          userId: selectedMember.userId,
          entityId: selectedMember.entityId,
          stageId: stageId || null,
          jobTitleAr: jobTitleAr.trim() || selectedMember.fullName,
          jobTitleEn: jobTitleEn.trim() || selectedMember.fullName,
          startsOn: startsOn || undefined,
          endsOn: endsOn || null,
          visibility,
        },
      }).then(() => undefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] });
      onClose();
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  const canSubmit = memberKind === "external" ? identifierComplete : Boolean(userId);

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("projectTeam.addTitle")}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="min-h-11"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("common.loading") : t("common.confirm")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("projectTeam.memberKind")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={memberKind}
            onChange={(e) => setMemberKind(e.target.value as "registered" | "external")}
          >
            <option value="registered">{t("projectTeam.kindRegistered")}</option>
            <option value="external">{t("projectTeam.kindExternal")}</option>
          </select>
        </label>

        {memberKind === "external" ? (
          <>
            <TextField
              id="external-identifier"
              label={t("projectTeam.nationalId")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              dir="ltr"
              hint={t("projectTeam.nationalIdHint")}
              required
            />
            {lookupState.status !== "idle" ? (
              <p
                aria-live="polite"
                className={
                  lookupState.status === "invalid" || lookupState.status === "throttled"
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {lookupState.status === "searching" ? t("projectTeam.lookupSearching") : null}
                {lookupState.status === "invalid" ? t("projectTeam.lookupInvalid") : null}
                {lookupState.status === "throttled" ? t("projectTeam.lookupThrottled") : null}
                {lookupState.status === "unregistered" ? t("projectTeam.lookupUnregistered") : null}
                {lookupState.status === "registered"
                  ? lookupState.displayName
                    ? t("projectTeam.lookupRegistered", { name: lookupState.displayName })
                    : t("projectTeam.lookupRegisteredNoName")
                  : null}
              </p>
            ) : null}
            <TextField
              id="external-name"
              label={t("projectTeam.nameOptional")}
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
            />
          </>
        ) : null}

        <label className="flex flex-col gap-1 text-sm" hidden={memberKind === "external"}>
          <span className="font-medium text-foreground">{t("projectTeam.member")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">{t("projectTeam.selectMember")}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName} — {m.entityName}
              </option>
            ))}
          </select>
        </label>
        {memberKind === "registered" && members.length === 0 && !membersQuery.isPending ? (
          <p className="text-xs text-muted-foreground">{t("projectTeam.noAssignableMembers")}</p>
        ) : null}

        <TextField
          id="job-title-ar"
          label={t("projectTeam.jobTitleAr")}
          value={jobTitleAr}
          onChange={(e) => setJobTitleAr(e.target.value)}
          hint={t("projectTeam.jobTitleOptional")}
        />
        <TextField
          id="job-title-en"
          label={t("projectTeam.jobTitleEn")}
          value={jobTitleEn}
          onChange={(e) => setJobTitleEn(e.target.value)}
          hint={t("projectTeam.jobTitleOptional")}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("projectTeam.stage")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">{t("common.optional")}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="starts-on"
            label={t("projectTeam.startsOn")}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <TextField
            id="ends-on"
            label={t("projectTeam.endsOn")}
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("projectTeam.visibility")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as VisibilityLevel)}
          >
            {VISIBILITY_LEVELS.map((v) => (
              <option key={v} value={v}>
                {t(`projectTeam.visibilityLevels.${v}`)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {t(`projectTeam.visibilityHints.${visibility}`)}
          </span>
        </label>

        {visibility === "limited" ? (
          <PartyAudienceField projectId={projectId} value={audience} onChange={setAudience} />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

function EditAssignmentModal({
  projectId,
  assignment,
  onClose,
}: {
  projectId: string;
  assignment: Assignment;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const stagesFn = useServerFn(listProjectStages);
  const updateFn = useServerFn(updateProjectAssignment);

  const stagesQuery = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => stagesFn({ data: { projectId } }),
  });

  const [stageId, setStageId] = React.useState(assignment.stage_id ?? "");
  const [jobTitleAr, setJobTitleAr] = React.useState(assignment.job_title_ar);
  const [jobTitleEn, setJobTitleEn] = React.useState(assignment.job_title_en);
  const [startsOn, setStartsOn] = React.useState(assignment.starts_on ?? "");
  const [endsOn, setEndsOn] = React.useState(assignment.ends_on ?? "");
  const [visibility, setVisibility] = React.useState<VisibilityLevel>(assignment.visibility);
  const [error, setError] = React.useState<string | null>(null);

  const stages = stagesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          assignmentId: assignment.id,
          jobTitleAr,
          jobTitleEn,
          stageId: stageId || null,
          clearStage: !stageId,
          startsOn: startsOn || undefined,
          endsOn: endsOn || null,
          visibility,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] });
      onClose();
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  const canSubmit = jobTitleAr.trim().length >= 2 && jobTitleEn.trim().length >= 2;

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("projectTeam.editTitle")}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="min-h-11"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField
          id="edit-job-title-ar"
          label={t("projectTeam.jobTitleAr")}
          value={jobTitleAr}
          onChange={(e) => setJobTitleAr(e.target.value)}
          required
        />
        <TextField
          id="edit-job-title-en"
          label={t("projectTeam.jobTitleEn")}
          value={jobTitleEn}
          onChange={(e) => setJobTitleEn(e.target.value)}
          required
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("projectTeam.stage")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">{t("common.optional")}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="edit-starts-on"
            label={t("projectTeam.startsOn")}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <TextField
            id="edit-ends-on"
            label={t("projectTeam.endsOn")}
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t("projectTeam.visibility")}</span>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as VisibilityLevel)}
          >
            {VISIBILITY_LEVELS.map((v) => (
              <option key={v} value={v}>
                {t(`projectTeam.visibilityLevels.${v}`)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {t(`projectTeam.visibilityHints.${visibility}`)}
          </span>
        </label>

        {visibility === "limited" ? (
          <PartyAudienceField projectId={projectId} value={audience} onChange={setAudience} />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

function EndAssignmentModal({
  projectId,
  assignment,
  onClose,
}: {
  projectId: string;
  assignment: Assignment;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const endFn = useServerFn(endProjectAssignment);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => endFn({ data: { assignmentId: assignment.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] });
      onClose();
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("projectTeam.endTitle")}
      description={t("projectTeam.endHint")}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("common.loading") : t("projectTeam.endConfirm")}
          </Button>
        </div>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </ResponsiveModal>
  );
}

function ProjectTeamPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const assignmentsFn = useServerFn(listProjectAssignments);
  const capabilitiesFn = useServerFn(getProjectTeamCapabilities);

  const assignmentsQuery = useQuery({
    queryKey: ["project-assignments", projectId],
    queryFn: () => assignmentsFn({ data: { projectId } }),
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["project-team-capabilities", projectId],
    queryFn: () => capabilitiesFn({ data: { projectId } }),
  });

  const [showAdd, setShowAdd] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Assignment | null>(null);
  const [endTarget, setEndTarget] = React.useState<Assignment | null>(null);

  const rows = assignmentsQuery.data ?? [];
  const canManage = capabilitiesQuery.data?.canManage ?? false;

  React.useEffect(() => {
    // Keep the assignments list fresh once capability changes.
    void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const isPending = assignmentsQuery.isPending || capabilitiesQuery.isPending;
  const isError = assignmentsQuery.isError || capabilitiesQuery.isError;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero
        title={t("projectTeam.title")}
        subtitle={t("projectTeam.subtitle")}
        aside={
          canManage ? (
            <Button className="min-h-11" onClick={() => setShowAdd(true)}>
              <Plus className="me-2 size-4" aria-hidden="true" />
              {t("projectTeam.add")}
            </Button>
          ) : undefined
        }
      />

      {isPending ? (
        <CardsSkeleton cards={1} />
      ) : isError ? (
        <ErrorState
          onRetry={() => {
            void assignmentsQuery.refetch();
            void capabilitiesQuery.refetch();
          }}
        />
      ) : (
        <SectionCard icon={Users} title={t("projectTeam.assignments")} count={rows.length}>
          {rows.length === 0 ? (
            <SoftEmpty icon={Users} message={t("projectTeam.noAssignments")} />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((a) => {
                const VisIcon = VISIBILITY_ICON[a.visibility];
                const label =
                  a.is_identified === false
                    ? a.job_title_ar
                    : (a.display_name ?? a.external_display_name ?? a.job_title_ar);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.job_title_ar}
                        {a.identifier_last4 ? (
                          <>
                            {" · "}
                            <bdi
                              dir="ltr"
                              className="font-mono"
                            >{`\u2022\u2022\u2022\u2022${a.identifier_last4}`}</bdi>
                          </>
                        ) : null}
                        {a.starts_on ? ` · ${formatDate(a.starts_on)}` : ""}
                      </p>
                    </div>
                    {a.is_external ? (
                      <Badge variant="outline">{t("projectTeam.externalBadge")}</Badge>
                    ) : null}
                    {a.is_external && !a.user_id ? (
                      <Badge variant="outline">{t("projectTeam.pendingBadge")}</Badge>
                    ) : null}
                    <Badge variant="secondary">{t(`team.status.${a.status}`)}</Badge>
                    <VisIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setEditTarget(a)}
                        >
                          <Pencil className="me-2 size-4" aria-hidden="true" />
                          {t("projectTeam.edit")}
                        </Button>
                        {a.status === "active" ? (
                          <Button
                            variant="outline"
                            className="min-h-11 text-destructive"
                            onClick={() => setEndTarget(a)}
                          >
                            <XCircle className="me-2 size-4" aria-hidden="true" />
                            {t("projectTeam.endAssignment")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {showAdd ? (
        <AddAssignmentModal projectId={projectId} onClose={() => setShowAdd(false)} />
      ) : null}
      {editTarget ? (
        <EditAssignmentModal
          projectId={projectId}
          assignment={editTarget}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
      {endTarget ? (
        <EndAssignmentModal
          projectId={projectId}
          assignment={endTarget}
          onClose={() => setEndTarget(null)}
        />
      ) : null}
    </div>
  );
}
