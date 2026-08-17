import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import {
  RakeezCard,
  TextField,
  TextAreaField,
  AsyncBoundary,
  SoftEmpty,
  ErrorState,
  PageHero,
  SectionCard,
  CardsSkeleton,
} from "@/components/rakeez";
import { MapPin, AlertTriangle, ClipboardList } from "lucide-react";
import { PreciseLocationSection } from "@/components/location/precise-location";
import { listStages } from "@/lib/stages.functions";
import { formatDateTime } from "@/lib/format";
import {
  OBSERVATION_KINDS,
  OBSERVATION_SEVERITIES,
  addObservationAction,
  createObservation,
  createVisit,
  listObservationActions,
  listObservations,
  listVisits,
  markActionDone,
  recordReinspection,
} from "@/lib/site-visits.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/visits")({
  component: VisitsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الزيارات الميدانية والملاحظات — ركيز" },
      {
        name: "description",
        content:
          "تسجيل الزيارات الميدانية وعدم المطابقة والإجراءات التصحيحية وإعادة الفحص مع حماية خصوصية الموقع الدقيق.",
      },
      { property: "og:title", content: "الزيارات الميدانية والملاحظات — ركيز" },
      {
        property: "og:description",
        content: "زيارات الموقع وملاحظات الجودة ودورة الإجراءات التصحيحية في منصة ركيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Kind = (typeof OBSERVATION_KINDS)[number];
type Severity = (typeof OBSERVATION_SEVERITIES)[number];

function VisitsPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchStages = useServerFn(listStages);
  const fetchVisits = useServerFn(listVisits);
  const fetchObservations = useServerFn(listObservations);
  const newVisit = useServerFn(createVisit);
  const newObservation = useServerFn(createObservation);

  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState("");
  const [obsStage, setObsStage] = React.useState("");
  const [obsKind, setObsKind] = React.useState<Kind>("nonconformity");
  const [obsSeverity, setObsSeverity] = React.useState<Severity>("medium");
  const [obsTitle, setObsTitle] = React.useState("");
  const [obsBody, setObsBody] = React.useState("");

  const stagesQuery = useQuery({
    queryKey: ["stages", projectId],
    queryFn: () => fetchStages({ data: { projectId } }),
  });
  const visitsQuery = useQuery({
    queryKey: ["visits", projectId],
    queryFn: () => fetchVisits({ data: { projectId } }),
  });
  const observationsQuery = useQuery({
    queryKey: ["observations", projectId],
    queryFn: () => fetchObservations({ data: { projectId } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["visits", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["observations", projectId] });
  };
  const run = <T,>(fn: () => Promise<T>) =>
    fn()
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message))
      .finally(refresh);

  const visitMutation = useMutation({
    mutationFn: () =>
      run(async () => {
        await newVisit({
          data: {
            projectId,
            summary: summary.trim() || null,
          },
        });
        setSummary("");
      }),
  });

  const observationMutation = useMutation({
    mutationFn: () =>
      run(async () => {
        await newObservation({
          data: {
            projectId,
            stageId: obsStage,
            kind: obsKind,
            severity: obsSeverity,
            title: obsTitle.trim(),
            body: obsBody.trim() || null,
          },
        });
        setObsTitle("");
        setObsBody("");
      }),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("visits.title")} subtitle={t("visits.subtitle")} />

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <SectionCard icon={MapPin} title={t("visits.newVisit")}>
        <p className="mb-4 text-xs text-muted-foreground">
          لا تسجّل الزيارة موقعًا جديدًا؛ يُعتمد الموقع الدقيق المحفوظ للمشروع.
        </p>
        <div className="mb-4">
          <PreciseLocationSection projectId={projectId} />
        </div>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            visitMutation.mutate();
          }}
        >
          <TextAreaField
            id="visit-summary"
            label={t("visits.summary")}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground"
          >
            {t("visits.newVisit")}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        icon={ClipboardList}
        title={t("visits.title")}
        count={visitsQuery.data?.length ?? 0}
      >
        <AsyncBoundary
          isLoading={visitsQuery.isLoading}
          isError={visitsQuery.isError}
          loadingFallback={<CardsSkeleton cards={1} />}
        >
          {(visitsQuery.data ?? []).length === 0 ? (
            <SoftEmpty icon={ClipboardList} message={t("visits.noVisits")} />
          ) : (
            <ul className="grid gap-2 text-sm">
              {(visitsQuery.data ?? []).map((v) => (
                <li key={v.id} className="flex flex-wrap justify-between gap-2">
                  <span>{v.summary ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(v.visit_start)}
                    {v.location_consent
                      ? ` · ${t(`visits.reasons.${v.location_reason ?? "other"}`)}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </SectionCard>

      <SectionCard icon={AlertTriangle} title={t("visits.newObservation")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            observationMutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t("stages.stage")}</span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={obsStage}
                onChange={(e) => setObsStage(e.target.value)}
                required
              >
                <option value="">—</option>
                {(stagesQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t("visits.kind")}</span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={obsKind}
                onChange={(e) => setObsKind(e.target.value as Kind)}
              >
                {OBSERVATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`visits.kinds.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t("visits.severity")}</span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={obsSeverity}
                onChange={(e) => setObsSeverity(e.target.value as Severity)}
              >
                {OBSERVATION_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`visits.severities.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TextField
            id="obs-title"
            label={t("visits.obsTitle")}
            value={obsTitle}
            onChange={(e) => setObsTitle(e.target.value)}
            required
          />
          <TextAreaField
            id="obs-body"
            label={t("visits.obsBody")}
            value={obsBody}
            onChange={(e) => setObsBody(e.target.value)}
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground"
          >
            {t("visits.newObservation")}
          </button>
        </form>
      </SectionCard>

      <div className="grid gap-4">
        <AsyncBoundary
          isLoading={observationsQuery.isLoading}
          isError={observationsQuery.isError}
          loadingFallback={<CardsSkeleton cards={1} />}
        >
          {(observationsQuery.data ?? []).map((o) => (
            <ObservationCard
              key={o.id}
              observationId={o.id}
              title={o.title}
              subtitle={`${t(`visits.kinds.${o.kind}`)} · ${t(`visits.severities.${o.severity}`)} · ${t(`visits.obsStatuses.${o.status}`)}`}
              onChanged={refresh}
              onError={setError}
            />
          ))}
        </AsyncBoundary>
      </div>
    </div>
  );
}

function ObservationCard({
  observationId,
  title,
  subtitle,
  onChanged,
  onError,
}: {
  observationId: string;
  title: string;
  subtitle: string;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const fetchActions = useServerFn(listObservationActions);
  const addAction = useServerFn(addObservationAction);
  const doneAction = useServerFn(markActionDone);
  const reinspect = useServerFn(recordReinspection);
  const [text, setText] = React.useState("");

  const actionsQuery = useQuery({
    queryKey: ["observation-actions", observationId],
    queryFn: () => fetchActions({ data: { observationId } }),
  });

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .catch((e: Error) => onError(e.message))
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["observation-actions", observationId] });
        onChanged();
      });

  return (
    <RakeezCard title={title} description={subtitle}>
      <AsyncBoundary isLoading={actionsQuery.isLoading} isError={actionsQuery.isError}>
        <ul className="grid gap-2 text-sm">
          {(actionsQuery.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.action_text}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-border px-3 text-xs"
                  onClick={() => void run(() => doneAction({ data: { actionId: a.id } }))}
                >
                  {t("visits.markDone")}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-border px-3 text-xs"
                  onClick={() =>
                    void run(() =>
                      reinspect({ data: { observationId, actionId: a.id, result: "passed" } }),
                    )
                  }
                >
                  {`${t("visits.reinspection")} · ${t("visits.passed")}`}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-border px-3 text-xs"
                  onClick={() =>
                    void run(() =>
                      reinspect({ data: { observationId, actionId: a.id, result: "failed" } }),
                    )
                  }
                >
                  {`${t("visits.reinspection")} · ${t("visits.failed")}`}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </AsyncBoundary>
      <p className="mt-2 text-xs text-muted-foreground">{t("visits.reinspectHint")}</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await addAction({ data: { observationId, actionText: text.trim() } });
            setText("");
          });
        }}
      >
        <TextField
          id={`action-${observationId}`}
          label={t("visits.actions")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button type="submit" className="min-h-11 rounded-md border border-border px-4 text-sm">
          {t("visits.addAction")}
        </button>
      </form>
    </RakeezCard>
  );
}
