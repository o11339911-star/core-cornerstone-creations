import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, TextAreaField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import { listProperties } from "@/lib/properties.functions";
import {
  SERVICE_STATUSES,
  createServiceRequest,
  listServiceCatalog,
  listServiceRequests,
  type ServiceRequestStatus,
} from "@/lib/services.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/services")({
  component: ServicesPage,
  head: () => ({
    meta: [
      { title: "الخدمات والعدادات — ركيز" },
      {
        name: "description",
        content:
          "طلبات الكهرباء والمياه والصرف الصحي والاتصالات والعدادات في ركيز: دورة موحّدة من تجهيز المتطلبات حتى التفعيل والربط بالعقار.",
      },
      { property: "og:title", content: "الخدمات والعدادات — ركيز" },
      {
        property: "og:description",
        content: "دورة خدمات موحّدة تنتهي بمراجعة الموظف المختص وربط العداد بالعقار أو الوحدة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ServicesPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchCatalog = useServerFn(listServiceCatalog);
  const fetchRequests = useServerFn(listServiceRequests);
  const fetchProperties = useServerFn(listProperties);
  const addRequest = useServerFn(createServiceRequest);

  const [status, setStatus] = React.useState<ServiceRequestStatus | "">("");
  const [serviceCode, setServiceCode] = React.useState("");
  const [propertyId, setPropertyId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [requirements, setRequirements] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const catalogQuery = useQuery({ queryKey: ["service-catalog"], queryFn: () => fetchCatalog({}) });
  const propertiesQuery = useQuery({ queryKey: ["properties"], queryFn: () => fetchProperties({}) });
  const requestsQuery = useQuery({
    queryKey: ["service-requests", projectId, status],
    queryFn: () => fetchRequests({ data: { projectId, status: status === "" ? null : status } }),
  });

  const catalog = catalogQuery.data ?? [];
  const properties = propertiesQuery.data ?? [];
  const effectiveService = serviceCode || catalog[0]?.code || "";
  const effectiveProperty = propertyId || properties[0]?.id || "";

  const createMutation = useMutation({
    mutationFn: () =>
      addRequest({
        data: {
          projectId,
          serviceCode: effectiveService,
          propertyId: effectiveProperty,
          subject: subject.trim(),
          requirementsNote: requirements.trim() || null,
        },
      }),
    onSuccess: () => {
      setSubject("");
      setRequirements("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["service-requests", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("services.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("services.hint")}</p>
      </header>

      <RakeezCard title={t("services.newRequest")}>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!effectiveService || !effectiveProperty || subject.trim().length < 2) return;
            createMutation.mutate();
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("services.service")}</span>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={effectiveService}
              onChange={(e) => setServiceCode(e.target.value)}
            >
              {catalog.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("services.property")}</span>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={effectiveProperty}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <TextField
            id="service-subject"
            label={t("requests.subject")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <TextAreaField
            id="service-requirements"
            label={t("services.requirements")}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />

          {error ? <p className="text-destructive text-sm md:col-span-2">{error}</p> : null}

          <div className="md:col-span-2">
            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={createMutation.isPending}
            >
              {t("requests.submit")}
            </button>
          </div>
        </form>
      </RakeezCard>

      <RakeezCard title={t("requests.list")}>
        <div className="mb-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("requests.status")}</span>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm md:w-64"
              value={status}
              onChange={(e) => setStatus(e.target.value as ServiceRequestStatus | "")}
            >
              <option value="">{t("requests.allStatuses")}</option>
              {SERVICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`requests.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <AsyncBoundary
          isLoading={requestsQuery.isLoading}
          isError={requestsQuery.isError}
          onRetry={() => void requestsQuery.refetch()}
        >
          {(requestsQuery.data ?? []).length === 0 ? (
            <EmptyState title={t("services.empty")} />
          ) : (
            <ul className="divide-border divide-y">
              {(requestsQuery.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="space-y-1">
                    <Link
                      to="/requests/$requestId"
                      params={{ requestId: r.id }}
                      className="font-medium hover:underline"
                    >
                      {r.request_no} — {r.subject}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {t("requests.statuses." + r.status)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </RakeezCard>
    </div>
  );
}
