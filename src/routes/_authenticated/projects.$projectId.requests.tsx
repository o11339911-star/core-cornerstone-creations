import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, TextAreaField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import {
  REQUEST_STATUSES,
  createRequest,
  listRequestTypes,
  listRequests,
  type RequestStatus,
} from "@/lib/requests.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/requests")({
  component: RequestsPage,
  head: () => ({
    meta: [
      { title: "طلبات المشروع — ركيز" },
      {
        name: "description",
        content:
          "إنشاء ومتابعة طلبات المشروع في منصة ركيز: طلب واحد بمعرّف ثابت، محادثة موحّدة، وتذكيرات لا تنشئ طلبًا جديدًا.",
      },
      { property: "og:title", content: "طلبات المشروع — ركيز" },
      {
        property: "og:description",
        content: "طلبات موحّدة بحالة واضحة ومحادثة واحدة لكل طلب طوال دورة حياته.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RequestsPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchTypes = useServerFn(listRequestTypes);
  const fetchRequests = useServerFn(listRequests);
  const addRequest = useServerFn(createRequest);

  const [status, setStatus] = React.useState<RequestStatus | "">("");
  const [typeCode, setTypeCode] = React.useState("info_request");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const typesQuery = useQuery({ queryKey: ["request-types"], queryFn: () => fetchTypes({}) });
  const requestsQuery = useQuery({
    queryKey: ["requests", projectId, status],
    queryFn: () => fetchRequests({ data: { projectId, status: status === "" ? null : status } }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      addRequest({
        data: { projectId, requestTypeCode: typeCode, subject: subject.trim(), body: body.trim() },
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["requests", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t.requests.title}</h1>
        <p className="text-sm text-muted-foreground">{t.requests.hint}</p>
      </header>

      <RakeezCard title={t.requests.newRequest}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t.requests.type}</span>
            <select
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value)}
            >
              {(typesQuery.data ?? []).map((rt) => (
                <option key={rt.code} value={rt.code}>
                  {rt.name_ar}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label={t.requests.subject}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <div className="md:col-span-2">
            <TextAreaField
              label={t.requests.body}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <button
          type="button"
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={subject.trim().length < 2 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {t.requests.submit}
        </button>
      </RakeezCard>

      <RakeezCard title={t.requests.list}>
        <label className="mb-3 flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t.requests.status}</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as RequestStatus | "")}
          >
            <option value="">{t.requests.allStatuses}</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.requests.statuses[s]}
              </option>
            ))}
          </select>
        </label>

        <AsyncBoundary
          isLoading={requestsQuery.isLoading}
          error={requestsQuery.error as Error | null}
          onRetry={() => void requestsQuery.refetch()}
        >
          {(requestsQuery.data ?? []).length === 0 ? (
            <EmptyState title={t.requests.empty} />
          ) : (
            <ul className="divide-y divide-border">
              {(requestsQuery.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/requests/$requestId"
                      params={{ requestId: r.id }}
                      className="truncate font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {r.request_no} — {r.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ar")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                    {t.requests.statuses[r.status as RequestStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </RakeezCard>
    </div>
  );
}
