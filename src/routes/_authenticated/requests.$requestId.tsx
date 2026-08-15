import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextAreaField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import {
  askForMoreInfo,
  closeRequest,
  decideRequest,
  getRequest,
  postRequestMessage,
  sendRequestReminder,
} from "@/lib/requests.functions";

export const Route = createFileRoute("/_authenticated/requests/$requestId")({
  component: RequestDetailPage,
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب — ركيز" },
      {
        name: "description",
        content:
          "عرض الطلب وقراره ومحادثته الموحّدة في منصة ركيز، مع سجل حالة كامل وملاحظات داخلية محمية.",
      },
      { property: "og:title", content: "تفاصيل الطلب — ركيز" },
      {
        property: "og:description",
        content: "قرار واضح، محادثة واحدة، وسجل حالة لا يمكن العبث به.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Visibility = "shared" | "party_limited" | "internal_note";

function RequestDetailPage() {
  const t = useT();
  const { requestId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchRequest = useServerFn(getRequest);
  const postMsg = useServerFn(postRequestMessage);
  const remind = useServerFn(sendRequestReminder);
  const askInfo = useServerFn(askForMoreInfo);
  const decide = useServerFn(decideRequest);
  const close = useServerFn(closeRequest);

  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("shared");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["request", requestId],
    queryFn: () => fetchRequest({ data: { requestId } }),
  });

  const refresh = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["request", requestId] });
  };
  const onError = (e: Error) => setError(e.message);

  const replyMutation = useMutation({
    mutationFn: () => postMsg({ data: { requestId, body: body.trim(), visibility, kind: "comment" } }),
    onSuccess: () => {
      setBody("");
      refresh();
    },
    onError,
  });
  const reminderMutation = useMutation({
    mutationFn: () => remind({ data: { requestId } }),
    onSuccess: refresh,
    onError,
  });
  const infoMutation = useMutation({
    mutationFn: () => askInfo({ data: { requestId, body: note.trim() || "نحتاج معلومات إضافية" } }),
    onSuccess: () => {
      setNote("");
      refresh();
    },
    onError,
  });
  const decisionMutation = useMutation({
    mutationFn: (approve: boolean) =>
      decide({ data: { requestId, approve, note: note.trim() || undefined } }),
    onSuccess: () => {
      setNote("");
      refresh();
    },
    onError,
  });
  const closeMutation = useMutation({
    mutationFn: () => close({ data: { requestId } }),
    onSuccess: refresh,
    onError,
  });

  const data = detailQuery.data;
  const status = data?.request.status ?? "draft";
  const isOpen = !["approved", "rejected", "cancelled", "closed"].includes(status);
  const canDecide = ["submitted", "in_review", "info_needed"].includes(status);
  const canClose = ["approved", "rejected"].includes(status);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <AsyncBoundary
        isLoading={detailQuery.isLoading}
        isError={Boolean(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      >
        {data ? (
          <>
            <header className="mb-6">
              <p className="text-xs font-medium text-muted-foreground">{data.request.request_no}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {data.request.subject}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
                  {t(`requests.statuses.${status}`)}
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                  {t(`requests.priorities.${data.request.priority}`)}
                </span>
              </div>
            </header>

            <RakeezCard title={t("requests.nextAction")}>
              {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
              {canDecide || canClose || isOpen ? (
                <div className="space-y-3">
                  <TextAreaField
                    id="r-note"
                    label={t("requests.decisionNote")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {isOpen ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-input px-4 text-sm font-medium text-foreground"
                        disabled={reminderMutation.isPending}
                        onClick={() => reminderMutation.mutate()}
                      >
                        {t("requests.reminder")}
                      </button>
                    ) : null}
                    {canDecide ? (
                      <>
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-input px-4 text-sm font-medium text-foreground"
                          disabled={infoMutation.isPending}
                          onClick={() => infoMutation.mutate()}
                        >
                          {t("requests.askInfo")}
                        </button>
                        <button
                          type="button"
                          className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                          disabled={decisionMutation.isPending}
                          onClick={() => decisionMutation.mutate(true)}
                        >
                          {t("requests.approve")}
                        </button>
                        <button
                          type="button"
                          className="min-h-11 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground"
                          disabled={decisionMutation.isPending}
                          onClick={() => decisionMutation.mutate(false)}
                        >
                          {t("requests.reject")}
                        </button>
                      </>
                    ) : null}
                    {canClose ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-input px-4 text-sm font-medium text-foreground"
                        disabled={closeMutation.isPending}
                        onClick={() => closeMutation.mutate()}
                      >
                        {t("requests.close")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("requests.noAction")}</p>
              )}
            </RakeezCard>

            <div className="mt-8">
              <RakeezCard title={t("requests.conversation")}>
                {data.messages.length === 0 ? (
                  <EmptyState title={t("requests.empty")} />
                ) : (
                  <ul className="space-y-3">
                    {data.messages.map((m) => (
                      <li
                        key={m.id}
                        className={
                          m.visibility === "internal_note"
                            ? "rounded-lg border border-dashed border-warning bg-warning-soft p-3"
                            : "rounded-lg border border-border bg-card p-3"
                        }
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{m.author_role_snapshot ?? ""}</span>
                          <span>{new Date(m.created_at).toLocaleString("ar")}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5">
                            {t(`requests.visibility.${m.visibility}`)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {isOpen ? (
                  <form
                    className="mt-4 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      replyMutation.mutate();
                    }}
                  >
                    <TextAreaField
                      id="r-reply"
                      label={t("requests.reply")}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                    />
                    <label className="flex max-w-xs flex-col gap-1 text-sm">
                      <span className="font-medium text-foreground">
                        {t("requests.visibilityLabel")}
                      </span>
                      <select
                        className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as Visibility)}
                      >
                        <option value="shared">{t("requests.visibility.shared")}</option>
                        <option value="party_limited">
                          {t("requests.visibility.party_limited")}
                        </option>
                        <option value="internal_note">
                          {t("requests.visibility.internal_note")}
                        </option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      disabled={body.trim().length === 0 || replyMutation.isPending}
                    >
                      {t("requests.send")}
                    </button>
                  </form>
                ) : null}
              </RakeezCard>
            </div>

            <div className="mt-8">
              <RakeezCard title={t("requests.timeline")}>
                <ol className="space-y-2">
                  {data.timeline.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-foreground">{entry.action}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString("ar")}
                      </span>
                    </li>
                  ))}
                </ol>
              </RakeezCard>
            </div>
          </>
        ) : null}
      </AsyncBoundary>
    </div>
  );
}
