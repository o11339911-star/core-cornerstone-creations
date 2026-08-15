import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import {
  addStageCriterion,
  approveStage,
  listStageCriteria,
  listStageTimeline,
  listStages,
  reportStageProgress,
  setCriterionResult,
  startStage,
  submitStage,
  type Stage,
} from "@/lib/stages.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/stages")({
  component: StagesPage,
  head: () => ({
    meta: [
      { title: "مراحل المشروع والتنفيذ — ركيز" },
      {
        name: "description",
        content:
          "متابعة مراحل المشروع الرئيسية والفرعية، معايير الإكمال، التقدّم، والاعتماد بفصل واضح بين المنفّذ والمعتمِد.",
      },
      { property: "og:title", content: "مراحل المشروع والتنفيذ — ركيز" },
      {
        property: "og:description",
        content: "شجرة المراحل ومعايير الإكمال والاعتماد في منصة ركيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StagesPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchStages = useServerFn(listStages);
  const fetchCriteria = useServerFn(listStageCriteria);
  const fetchTimeline = useServerFn(listStageTimeline);
  const start = useServerFn(startStage);
  const submit = useServerFn(submitStage);
  const approve = useServerFn(approveStage);
  const addCriterion = useServerFn(addStageCriterion);
  const setResult = useServerFn(setCriterionResult);
  const reportProgress = useServerFn(reportStageProgress);

  const [selected, setSelected] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [labelAr, setLabelAr] = React.useState("");
  const [labelEn, setLabelEn] = React.useState("");
  const [percent, setPercent] = React.useState("");

  const stagesQuery = useQuery({
    queryKey: ["stages", projectId],
    queryFn: () => fetchStages({ data: { projectId } }),
  });

  const stageId = selected ?? stagesQuery.data?.[0]?.id ?? null;

  const criteriaQuery = useQuery({
    queryKey: ["stage-criteria", stageId],
    queryFn: () => fetchCriteria({ data: { stageId: stageId as string } }),
    enabled: !!stageId,
  });
  const timelineQuery = useQuery({
    queryKey: ["stage-timeline", projectId, stageId],
    queryFn: () => fetchTimeline({ data: { projectId, stageId: stageId as string } }),
    enabled: !!stageId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["stages", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["stage-criteria", stageId] });
    void queryClient.invalidateQueries({ queryKey: ["stage-timeline", projectId, stageId] });
  };
  const run = <T,>(fn: () => Promise<T>) =>
    fn()
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message))
      .finally(refresh);

  const startMutation = useMutation({
    mutationFn: () => run(() => start({ data: { stageId: stageId as string } })),
  });
  const submitMutation = useMutation({
    mutationFn: () => run(() => submit({ data: { stageId: stageId as string } })),
  });
  const approveMutation = useMutation({
    mutationFn: () => run(() => approve({ data: { stageId: stageId as string } })),
  });
  const criterionMutation = useMutation({
    mutationFn: () =>
      run(async () => {
        await addCriterion({
          data: { stageId: stageId as string, code, labelAr, labelEn, isRequired: true },
        });
        setCode("");
        setLabelAr("");
        setLabelEn("");
      }),
  });
  const progressMutation = useMutation({
    mutationFn: () =>
      run(async () => {
        await reportProgress({
          data: { stageId: stageId as string, percent: Number(percent) },
        });
        setPercent("");
      }),
  });

  const roots = (stagesQuery.data ?? []).filter((s) => !s.parent_stage_id);
  const childrenOf = (id: string) => (stagesQuery.data ?? []).filter((s) => s.parent_stage_id === id);
  const current = (stagesQuery.data ?? []).find((s) => s.id === stageId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("stages.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("stages.subtitle")}</p>
      </header>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <RakeezCard title={t("stages.stage")}>
          <AsyncBoundary isLoading={stagesQuery.isLoading} error={stagesQuery.error}>
            {roots.length === 0 ? (
              <EmptyState title={t("stages.noStages")} />
            ) : (
              <ul className="grid gap-1">
                {roots.map((s) => (
                  <li key={s.id}>
                    <StageButton stage={s} active={s.id === stageId} onSelect={setSelected} />
                    {childrenOf(s.id).length > 0 ? (
                      <ul className="ms-4 mt-1 grid gap-1 border-s border-border ps-2">
                        {childrenOf(s.id).map((c) => (
                          <li key={c.id}>
                            <StageButton stage={c} active={c.id === stageId} onSelect={setSelected} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
        </RakeezCard>

        <div className="grid gap-6">
          {current ? (
            <RakeezCard
              title={current.name_ar}
              description={t(`stages.statuses.${current.status}`)}
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-border px-4 text-sm"
                  onClick={() => startMutation.mutate()}
                >
                  {t("stages.start")}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-border px-4 text-sm"
                  onClick={() => submitMutation.mutate()}
                >
                  {t("stages.submit")}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground"
                  onClick={() => approveMutation.mutate()}
                >
                  {t("stages.approve")}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("stages.approveHint")}</p>

              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  progressMutation.mutate();
                }}
              >
                <TextField
                  id="stage-percent"
                  label={t("stages.progress")}
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-md border border-border px-4 text-sm"
                >
                  {t("stages.reportProgress")}
                </button>
              </form>
            </RakeezCard>
          ) : null}

          <RakeezCard title={t("stages.criteria")}>
            <AsyncBoundary isLoading={criteriaQuery.isLoading} error={criteriaQuery.error}>
              <ul className="grid gap-2">
                {(criteriaQuery.data ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {c.label_ar}
                      {c.is_required ? (
                        <span className="ms-2 text-xs text-muted-foreground">
                          ({t("stages.required")})
                        </span>
                      ) : null}
                    </span>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={c.satisfied}
                        onChange={(e) =>
                          void run(() =>
                            setResult({
                              data: {
                                criterionId: c.id,
                                stageId: stageId as string,
                                satisfied: e.target.checked,
                              },
                            }),
                          )
                        }
                      />
                      <span>{c.satisfied ? t("stages.satisfied") : t("stages.notSatisfied")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </AsyncBoundary>

            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                criterionMutation.mutate();
              }}
            >
              <TextField
                id="crit-code"
                label={t("stages.code")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <TextField
                id="crit-ar"
                label={t("stages.labelAr")}
                value={labelAr}
                onChange={(e) => setLabelAr(e.target.value)}
                required
              />
              <TextField
                id="crit-en"
                label={t("stages.labelEn")}
                value={labelEn}
                onChange={(e) => setLabelEn(e.target.value)}
                required
              />
              <button
                type="submit"
                className="min-h-11 rounded-md border border-border px-4 text-sm sm:col-span-3"
              >
                {t("stages.addCriterion")}
              </button>
            </form>
          </RakeezCard>

          <RakeezCard title={t("stages.timeline")}>
            <AsyncBoundary isLoading={timelineQuery.isLoading} error={timelineQuery.error}>
              <ol className="grid gap-2 text-sm">
                {(timelineQuery.data ?? []).map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{row.object_type}</span>
                    <span>{row.action}</span>
                    <time dateTime={row.created_at} className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            </AsyncBoundary>
          </RakeezCard>
        </div>
      </div>
    </div>
  );
}

function StageButton({
  stage,
  active,
  onSelect,
}: {
  stage: Stage;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      className={`w-full rounded-md px-3 py-2 text-start text-sm ${
        active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground"
      }`}
    >
      <span className="block">{stage.name_ar}</span>
      <span className="block text-xs">{t(`stages.statuses.${stage.status}`)}</span>
    </button>
  );
}
