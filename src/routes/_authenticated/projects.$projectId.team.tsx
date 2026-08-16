import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Plus, Users } from "lucide-react";

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
  listAssignableMembers,
  listProjectAssignments,
  setAssignmentVisibility,
  VISIBILITY_LEVELS,
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

function AddAssignmentModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const membersFn = useServerFn(listAssignableMembers);
  const stagesFn = useServerFn(listProjectStages);
  const createFn = useServerFn(createAssignment);

  const membersQuery = useQuery({
    queryKey: ["assignable-members", projectId],
    queryFn: () => membersFn({ data: { projectId } }),
  });
  const stagesQuery = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => stagesFn({ data: { projectId } }),
  });

  const [userId, setUserId] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [jobTitleAr, setJobTitleAr] = React.useState("");
  const [jobTitleEn, setJobTitleEn] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [visibility, setVisibility] = React.useState<VisibilityLevel>("internal");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          userId,
          stageId: stageId || null,
          jobTitleAr,
          jobTitleEn,
          startsOn: startsOn || undefined,
          endsOn: endsOn || null,
          visibility,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const members = membersQuery.data ?? [];
  const stages = stagesQuery.data ?? [];
  const canSubmit = userId && jobTitleAr.trim().length >= 2 && jobTitleEn.trim().length >= 2;

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
        {members.length === 0 && !membersQuery.isPending ? (
          <p className="text-xs text-muted-foreground">{t("projectTeam.noAssignableMembers")}</p>
        ) : null}

        <TextField
          id="job-title-ar"
          label={t("projectTeam.jobTitleAr")}
          value={jobTitleAr}
          onChange={(e) => setJobTitleAr(e.target.value)}
          required
        />
        <TextField
          id="job-title-en"
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
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

function ProjectTeamPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const assignmentsFn = useServerFn(listProjectAssignments);
  const setVisibilityFn = useServerFn(setAssignmentVisibility);

  const assignmentsQuery = useQuery({
    queryKey: ["project-assignments", projectId],
    queryFn: () => assignmentsFn({ data: { projectId } }),
  });

  const visibilityMutation = useMutation({
    mutationFn: (vars: { assignmentId: string; visibility: VisibilityLevel }) =>
      setVisibilityFn({ data: vars }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["project-assignments", projectId] }),
  });

  const [showAdd, setShowAdd] = React.useState(false);

  const rows = assignmentsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero
        title={t("projectTeam.title")}
        subtitle={t("projectTeam.subtitle")}
        aside={
          <Button className="min-h-11" onClick={() => setShowAdd(true)}>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t("projectTeam.add")}
          </Button>
        }
      />

      {assignmentsQuery.isPending ? (
        <CardsSkeleton cards={1} />
      ) : assignmentsQuery.isError ? (
        <ErrorState onRetry={() => void assignmentsQuery.refetch()} />
      ) : (
        <SectionCard icon={Users} title={t("projectTeam.assignments")} count={rows.length}>
          {rows.length === 0 ? (
            <SoftEmpty icon={Users} message={t("projectTeam.noAssignments")} />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((a) => {
                const VisIcon = VISIBILITY_ICON[a.visibility];
                const label = a.is_identified === false ? a.job_title_ar : a.display_name ?? a.job_title_ar;
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.job_title_ar}
                        {a.starts_on ? ` · ${formatDate(a.starts_on)}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{t(`team.status.${a.status}`)}</Badge>
                    <select
                      className="min-h-11 rounded-md border border-input bg-background px-2 text-xs"
                      value={a.visibility}
                      onChange={(e) =>
                        visibilityMutation.mutate({
                          assignmentId: a.id,
                          visibility: e.target.value as VisibilityLevel,
                        })
                      }
                    >
                      {VISIBILITY_LEVELS.map((v) => (
                        <option key={v} value={v}>
                          {t(`projectTeam.visibilityLevels.${v}`)}
                        </option>
                      ))}
                    </select>
                    <VisIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {showAdd ? <AddAssignmentModal projectId={projectId} onClose={() => setShowAdd(false)} /> : null}
    </div>
  );
}
