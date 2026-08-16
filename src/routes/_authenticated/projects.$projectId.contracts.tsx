import { ArchiveButton } from "@/components/archive/archive-button";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { ContractIdentityLookup } from "@/components/identity/identity-search";
import {
  TextField,
  AsyncBoundary,
  SoftEmpty,
  ErrorState,
  PageHero,
  SectionCard,
  CardsSkeleton,
} from "@/components/rakeez";
import {
  FileSignature,
  ScrollText,
  CalendarClock,
  GitPullRequest,
  MessageSquare,
  Layers,
} from "lucide-react";
import {
  CONTRACT_TYPES,
  approveContractVersion,
  createContract,
  decideChangeOrder,
  decideContractExtension,
  listChangeOrders,
  listContractExtensions,
  listContractVersions,
  listContracts,
  requestChangeOrder,
  requestContractExtension,
  type ContractType,
} from "@/lib/contracts.functions";
import {
  MESSAGE_VISIBILITY,
  createThread,
  listMessages,
  listThreads,
  postMessage,
  type MessageVisibility,
} from "@/lib/correspondence.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/contracts")({
  component: ContractsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "عقود المشروع والمراسلات — ركيز" },
      {
        name: "description",
        content:
          "إدارة عقود المشروع وإصداراتها المعتمدة وطلبات التمديد وأوامر التغيير والمراسلات مع الأطراف في منصة ركيز.",
      },
      { property: "og:title", content: "عقود المشروع والمراسلات — ركيز" },
      {
        property: "og:description",
        content: "عقود لا تُعدَّل بعد الاعتماد، ملاحق وأوامر تغيير، ومراسلات بمستويات ظهور واضحة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ContractsPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchContracts = useServerFn(listContracts);
  const addContract = useServerFn(createContract);

  const contractsQuery = useQuery({
    queryKey: ["contracts", projectId],
    queryFn: () => fetchContracts({ data: { projectId } }),
  });

  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<ContractType>("works");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      addContract({
        data: {
          projectId,
          title: title.trim(),
          contractType: type,
          startsOn,
          endsOn: endsOn || null,
          amount: amount ? Number(amount) : null,
        },
      }),
    onSuccess: () => {
      setError(null);
      setTitle("");
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["contracts", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("contracts.title")} subtitle={t("contracts.subtitle")} />

      <SectionCard icon={FileSignature} title={t("contracts.newTitle")}>
        <p className="mb-4 text-xs text-muted-foreground">{t("contracts.approvalNote")}</p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField
            id="c-title"
            label={t("contracts.name")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("contracts.type")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as ContractType)}
            >
              {CONTRACT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {t(`contracts.types.${ct}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="c-start"
            label={t("contracts.startsOn")}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <TextField
            id="c-end"
            label={t("contracts.endsOn")}
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
          <TextField
            id="c-amount"
            label={t("contracts.amount")}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {t("contracts.create")}
            </button>
          </div>
        </form>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </SectionCard>

      <SectionCard icon={Layers} title={t("contracts.list")} count={contractsQuery.data?.length ?? 0}>
        <AsyncBoundary
          isLoading={contractsQuery.isLoading}
          isError={contractsQuery.isError}
          onRetry={() => void contractsQuery.refetch()}
          loadingFallback={<CardsSkeleton cards={2} />}
        >
          {(contractsQuery.data ?? []).length === 0 ? (
            <SoftEmpty icon={Layers} message={t("contracts.none")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(contractsQuery.data ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-muted-foreground">{t(`contracts.types.${c.contract_type}`)}</span>
                  <span className="text-muted-foreground">{t(`contracts.statuses.${c.status}`)}</span>
                  <span className="ms-auto flex items-center gap-2">
                    <ArchiveButton
                      compact
                      title={c.title}
                      kind="contract"
                      sourceTable="contracts"
                      sourceId={c.id}
                    />
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-input px-3"
                      onClick={() => setSelected(selected === c.id ? null : c.id)}
                    >
                      {selected === c.id ? t("contracts.hide") : t("contracts.open")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </SectionCard>

      {selected ? <ContractDetail contractId={selected} projectId={projectId} /> : null}
    </div>
  );
}

function ContractDetail({ contractId, projectId }: { contractId: string; projectId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchVersions = useServerFn(listContractVersions);
  const fetchExtensions = useServerFn(listContractExtensions);
  const fetchChangeOrders = useServerFn(listChangeOrders);
  const approve = useServerFn(approveContractVersion);
  const askExtension = useServerFn(requestContractExtension);
  const decideExtension = useServerFn(decideContractExtension);
  const askChange = useServerFn(requestChangeOrder);
  const decideChange = useServerFn(decideChangeOrder);

  const versionsQuery = useQuery({
    queryKey: ["contract-versions", contractId],
    queryFn: () => fetchVersions({ data: { contractId } }),
  });
  const extensionsQuery = useQuery({
    queryKey: ["contract-extensions", contractId],
    queryFn: () => fetchExtensions({ data: { contractId } }),
  });
  const changeOrdersQuery = useQuery({
    queryKey: ["change-orders", contractId],
    queryFn: () => fetchChangeOrders({ data: { contractId } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contract-versions", contractId] });
    void queryClient.invalidateQueries({ queryKey: ["contract-extensions", contractId] });
    void queryClient.invalidateQueries({ queryKey: ["change-orders", contractId] });
  };

  const [extEnd, setExtEnd] = React.useState("");
  const [extReason, setExtReason] = React.useState("");
  const [coTitle, setCoTitle] = React.useState("");
  const [coDelta, setCoDelta] = React.useState("");
  const [coDays, setCoDays] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const onError = (e: Error) => setError(e.message);
  const onDone = () => {
    setError(null);
    refresh();
  };

  const approveMutation = useMutation({
    mutationFn: (versionId: string) => approve({ data: { versionId } }),
    onSuccess: onDone,
    onError,
  });
  const extensionMutation = useMutation({
    mutationFn: () =>
      askExtension({ data: { contractId, requestedEndsOn: extEnd, reason: extReason || null } }),
    onSuccess: () => {
      setExtEnd("");
      setExtReason("");
      onDone();
    },
    onError,
  });
  const extensionDecision = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      decideExtension({ data: { extensionId: v.id, approve: v.approve } }),
    onSuccess: onDone,
    onError,
  });
  const changeMutation = useMutation({
    mutationFn: () =>
      askChange({
        data: {
          contractId,
          title: coTitle.trim(),
          durationDeltaDays: coDays ? Number(coDays) : 0,
          amountDelta: coDelta ? Number(coDelta) : null,
        },
      }),
    onSuccess: () => {
      setCoTitle("");
      setCoDelta("");
      setCoDays("");
      onDone();
    },
    onError,
  });
  const changeDecision = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      decideChange({ data: { changeOrderId: v.id, approve: v.approve } }),
    onSuccess: onDone,
    onError,
  });

  return (
    <div className="mt-8 grid gap-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ContractIdentityLookup projectId={projectId} contractId={contractId} />

      <SectionCard icon={ScrollText} title={t("contracts.versions")}>
        <p className="mb-3 text-xs text-muted-foreground">{t("contracts.versionsHint")}</p>
        <ul className="divide-y divide-border text-sm">
          {(versionsQuery.data ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-mono">#{v.version_no}</span>
              <span className="text-muted-foreground">{t(`contracts.sources.${v.source}`)}</span>
              <span>
                {v.starts_on} → {v.ends_on ?? "—"}
              </span>
              <span className="text-muted-foreground">
                {v.amount_visible ? `${v.amount}` : t("contracts.amountHidden")}
              </span>
              {v.approved_at ? (
                <span className="text-muted-foreground">{t("contracts.approved")}</span>
              ) : (
                <button
                  type="button"
                  className="ms-auto min-h-11 rounded-md border border-input px-3"
                  onClick={() => approveMutation.mutate(v.id)}
                >
                  {t("contracts.approve")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard icon={CalendarClock} title={t("contracts.extensions")}>
        <p className="mb-3 text-xs text-muted-foreground">{t("contracts.extensionsHint")}</p>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            extensionMutation.mutate();
          }}
        >
          <TextField
            id="ext-end"
            label={t("contracts.newEndsOn")}
            type="date"
            value={extEnd}
            onChange={(e) => setExtEnd(e.target.value)}
            required
          />
          <TextField
            id="ext-reason"
            label={t("contracts.reason")}
            value={extReason}
            onChange={(e) => setExtReason(e.target.value)}
          />
          <button
            type="submit"
            className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("contracts.request")}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-border text-sm">
          {(extensionsQuery.data ?? []).map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-2">
              <span>{x.requested_ends_on}</span>
              <span className="text-muted-foreground">{t(`contracts.reqStatuses.${x.status}`)}</span>
              {x.status === "requested" ? (
                <span className="ms-auto flex gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-input px-3"
                    onClick={() => extensionDecision.mutate({ id: x.id, approve: true })}
                  >
                    {t("contracts.accept")}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-input px-3"
                    onClick={() => extensionDecision.mutate({ id: x.id, approve: false })}
                  >
                    {t("contracts.reject")}
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard icon={GitPullRequest} title={t("contracts.changeOrders")}>
        <p className="mb-3 text-xs text-muted-foreground">{t("contracts.changeOrdersHint")}</p>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            changeMutation.mutate();
          }}
        >
          <TextField
            id="co-title"
            label={t("contracts.coTitle")}
            value={coTitle}
            onChange={(e) => setCoTitle(e.target.value)}
            required
          />
          <TextField
            id="co-amount"
            label={t("contracts.amountDelta")}
            type="number"
            value={coDelta}
            onChange={(e) => setCoDelta(e.target.value)}
          />
          <TextField
            id="co-days"
            label={t("contracts.daysDelta")}
            type="number"
            value={coDays}
            onChange={(e) => setCoDays(e.target.value)}
          />
          <button
            type="submit"
            className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("contracts.request")}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-border text-sm">
          {(changeOrdersQuery.data ?? []).map((co) => (
            <li key={co.id} className="flex flex-wrap items-center gap-3 py-2">
              <span>{co.title}</span>
              <span className="text-muted-foreground">{t(`contracts.reqStatuses.${co.status}`)}</span>
              {co.status === "requested" || co.status === "under_review" ? (
                <span className="ms-auto flex gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-input px-3"
                    onClick={() => changeDecision.mutate({ id: co.id, approve: true })}
                  >
                    {t("contracts.accept")}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-input px-3"
                    onClick={() => changeDecision.mutate({ id: co.id, approve: false })}
                  >
                    {t("contracts.reject")}
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>

      <Correspondence projectId={projectId} contractId={contractId} />
    </div>
  );
}

function Correspondence({ projectId, contractId }: { projectId: string; contractId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchThreads = useServerFn(listThreads);
  const addThread = useServerFn(createThread);
  const fetchMessages = useServerFn(listMessages);
  const send = useServerFn(postMessage);

  const threadsQuery = useQuery({
    queryKey: ["threads", contractId],
    queryFn: () => fetchThreads({ data: { projectId, contractId } }),
  });

  const [subject, setSubject] = React.useState("");
  const [openThread, setOpenThread] = React.useState<string | null>(null);
  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<MessageVisibility>("shared");
  const [error, setError] = React.useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["messages", openThread],
    queryFn: () => fetchMessages({ data: { threadId: openThread as string } }),
    enabled: Boolean(openThread),
  });

  const threadMutation = useMutation({
    mutationFn: () => addThread({ data: { projectId, contractId, subject: subject.trim() } }),
    onSuccess: () => {
      setSubject("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["threads", contractId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const messageMutation = useMutation({
    mutationFn: () => send({ data: { threadId: openThread as string, body: body.trim(), visibility } }),
    onSuccess: () => {
      setBody("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["messages", openThread] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <SectionCard icon={MessageSquare} title={t("correspondence.title")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("correspondence.hint")}</p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          threadMutation.mutate();
        }}
      >
        <TextField
          id="thread-subject"
          label={t("correspondence.subject")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <button
          type="submit"
          className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t("correspondence.newThread")}
        </button>
      </form>

      <ul className="mt-4 divide-y divide-border text-sm">
        {(threadsQuery.data ?? []).map((th) => (
          <li key={th.id} className="py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 text-start font-medium"
                onClick={() => setOpenThread(openThread === th.id ? null : th.id)}
              >
                {th.subject}
              </button>
              <ArchiveButton
                compact
                title={th.subject}
                kind="thread"
                sourceTable="correspondence_threads"
                sourceId={th.id}
              />
            </div>
            {openThread === th.id ? (
              <div className="mt-2 grid gap-3">
                <ul className="grid gap-2">
                  {(messagesQuery.data ?? []).map((m) => (
                    <li key={m.id} className="rounded-md border border-border p-2">
                      <span className="me-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t(`correspondence.visibility.${m.visibility}`)}
                      </span>
                      <span>{m.body}</span>
                    </li>
                  ))}
                </ul>
                <form
                  className="grid gap-2 sm:grid-cols-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    messageMutation.mutate();
                  }}
                >
                  <TextField
                    id={`msg-${th.id}`}
                    label={t("correspondence.message")}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                  />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-foreground">
                      {t("correspondence.visibilityLabel")}
                    </span>
                    <select
                      className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as MessageVisibility)}
                    >
                      {MESSAGE_VISIBILITY.map((v) => (
                        <option key={v} value={v}>
                          {t(`correspondence.visibility.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    {t("correspondence.send")}
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}