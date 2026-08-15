import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import {
  TextField,
  TextAreaField,
  AsyncBoundary,
  SoftEmpty,
  ErrorState,
  PageHero,
  SectionCard,
  CardsSkeleton,
} from "@/components/rakeez";
import { MessageSquarePlus, ListChecks } from "lucide-react";
import {
  REQUEST_STATUSES,
  createRequest,
  listRequestTypes,
  listRequests,
  type RequestStatus,
} from "@/lib/requests.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/requests")({
  component: RequestsPage,
  errorComponent: ErrorState,
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
  const [typeCode, setTypeCode] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const typesQuery = useQuery({ queryKey: ["request-types"], queryFn: () => fetchTypes({}) });
  const requestsQuery = useQuery({
    queryKey: ["requests", projectId, status],
    queryFn: () => fetchRequests({ data: { projectId, status: status === "" ? null : status } }),
  });

  const types = typesQuery.data ?? [];
  const effectiveType = typeCode || types[0]?.code || "";

  const createMutation = useMutation({
    mutationFn: () =>
      addRequest({
        data: {
          projectId,
          requestTypeCode: effectiveType,
          subject: subject.trim(),
          body: body.trim(),
        },
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
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("requests.title")} subtitle={t("requests.hint")} />

      <SectionCard icon={MessageSquarePlus} title={t("requests.newRequest")}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (effectiveType) createMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("requests.type")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveType}
              onChange={(e) => setTypeCode(e.target.value)}
            >
              {types.map((rt) => (
                <option key={rt.code} value={rt.code}>
                  {rt.name_ar}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="r-subject"
            label={t("requests.subject")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <div className="sm:col-span-2">
            <TextAreaField
              id="r-body"
              label={t("requests.body")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={subject.trim().length < 2 || !effectiveType || createMutation.isPending}
            >
              {t("requests.submit")}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard icon={ListChecks} title={t("requests.list")} count={requestsQuery.data?.length ?? 0}>
          <label className="mb-4 flex max-w-xs flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("requests.status")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as RequestStatus | "")}
            >
              <option value="">{t("requests.allStatuses")}</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`requests.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>

          <AsyncBoundary
            isLoading={requestsQuery.isLoading}
            isError={Boolean(requestsQuery.error)}
            onRetry={() => void requestsQuery.refetch()}
            loadingFallback={<CardsSkeleton cards={1} />}
          >
            {(requestsQuery.data ?? []).length === 0 ? (
              <SoftEmpty icon={ListChecks} message={t("requests.empty")} />
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
                      {t(`requests.statuses.${r.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
      </SectionCard>
    </div>
  );
}
