import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Mic, MicOff, Phone, PhoneCall, PhoneOff, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardsSkeleton,
  ErrorState,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useAccountUi } from "@/lib/account-ui";
import { endCall, getCallCenter, respondToCall, startCall } from "@/lib/calls.functions";
import { formatCallDuration, useVoiceCall } from "@/lib/calls/webrtc";

export const Route = createFileRoute("/_authenticated/calls")({
  component: CallsPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>) => ({
    answer: typeof search["answer"] === "string" ? (search["answer"] as string) : undefined,
  }),

  head: () => ({
    meta: [
      { title: "الاتصال الداخلي | ركيز" },
      {
        name: "description",
        content: "مكالمات صوتية داخل ركيز بين أطراف موعد مؤكد، بلا كشف أرقام الجوال وبلا تسجيل.",
      },
      { property: "og:title", content: "الاتصال الداخلي | ركيز" },
      {
        property: "og:description",
        content: "اتصال صوتي داخل المنصة يعتمد على المواعيد المؤكدة والصلاحيات الفعلية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ActiveCall = { callId: string; role: "caller" | "callee"; otherName: string };

function CallsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchCenter = useServerFn(getCallCenter);
  const start = useServerFn(startCall);
  const respond = useServerFn(respondToCall);
  const finish = useServerFn(endCall);

  const [active, setActive] = React.useState<ActiveCall | null>(null);

  const center = useQuery({
    queryKey: ["call-center", entityId],
    queryFn: () => fetchCenter({ data: { entityId } }),
    enabled: !loading,
    refetchInterval: active ? false : 8000,
  });

  const call = useVoiceCall({
    callId: active?.callId ?? null,
    entityId,
    role: active?.role ?? "caller",
    active: Boolean(active && entityId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["call-center", entityId] });

  const startMutation = useMutation({
    mutationFn: (input: { appointmentId: string; otherName: string }) =>
      start({ data: { appointmentId: input.appointmentId, entityId: entityId as string } }),
    onSuccess: (result, input) => {
      setActive({ callId: result.callId, role: "caller", otherName: input.otherName });
      invalidate();
    },
    onError: () => toast.error(t("calls.error.start")),
  });

  const answerMutation = useMutation({
    mutationFn: (input: { callId: string; accept: boolean; otherName: string }) =>
      respond({
        data: { callId: input.callId, entityId: entityId as string, accept: input.accept },
      }),
    onSuccess: (_r, input) => {
      if (input.accept) {
        setActive({ callId: input.callId, role: "callee", otherName: input.otherName });
      }
      invalidate();
    },
    onError: () => toast.error(t("calls.error.start")),
  });

  const hangUp = React.useCallback(() => {
    const current = active;
    call.hangup();
    setActive(null);
    if (current && entityId) {
      void finish({ data: { callId: current.callId, entityId, reason: "hangup" } })
        .catch(() => undefined)
        .finally(invalidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, entityId, call, finish]);

  React.useEffect(() => {
    if (call.phase === "ended" && active) hangUp();
  }, [call.phase, active, hangUp]);

  // Answering from the shell banner deep-links here with ?answer=<callId>.
  const { answer } = Route.useSearch();
  const navigate = useNavigate();
  const answeredRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!answer || !entityId || active || answeredRef.current === answer) return;
    const match = center.data?.incoming?.find((c) => c.id === answer);
    if (!match) return;
    answeredRef.current = answer;
    answerMutation.mutate({ callId: match.id, accept: true, otherName: match.caller_name });
    void navigate({ to: "/calls", search: { answer: undefined }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, entityId, active, center.data]);

  const data = center.data;
  const incoming = data?.incoming ?? [];
  const callable = data?.callable ?? [];

  const history = data?.history ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero
        title={t("calls.title")}
        subtitle={t("calls.subtitle")}
        badge={<HeroBadge>{t("shell.calls")}</HeroBadge>}
      >
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          {t("calls.privacy")}
        </p>
      </PageHero>

      {active ? (
        <SectionCard icon={PhoneCall} title={t("calls.title")}>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-secondary text-primary">
              <Phone className="size-7" aria-hidden="true" />
            </span>
            <p className="text-lg font-semibold text-foreground">{active.otherName}</p>
            <p className="text-sm text-muted-foreground" role="status">
              {call.phase === "connected" ? (
                <span dir="ltr">{formatCallDuration(call.seconds)}</span>
              ) : call.phase === "failed" ? (
                t(call.errorKey ?? "calls.error.connection")
              ) : (
                t(active.role === "caller" ? "calls.calling" : "calls.connecting")
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={call.toggleMute}
                disabled={call.phase !== "connected"}
              >
                {call.muted ? (
                  <MicOff className="size-4" aria-hidden="true" />
                ) : (
                  <Mic className="size-4" aria-hidden="true" />
                )}
                {t(call.muted ? "calls.unmute" : "calls.mute")}
              </Button>
              {call.phase === "failed" ? (
                <Button variant="outline" size="lg" className="min-h-11" onClick={call.retry}>
                  {t("calls.retry")}
                </Button>
              ) : null}
              <Button variant="destructive" size="lg" className="min-h-11" onClick={hangUp}>
                <PhoneOff className="size-4" aria-hidden="true" />
                {t("calls.hangup")}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {!active && incoming.length > 0 ? (
        <SectionCard icon={PhoneCall} title={t("calls.incoming")}>
          <ul className="space-y-3">
            {incoming.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm font-semibold text-foreground">
                  {t("calls.incomingFrom", { name: c.caller_name })}
                </p>
                <div className="flex gap-2">
                  <Button
                    className="min-h-11 flex-1 sm:flex-none"
                    onClick={() =>
                      answerMutation.mutate({
                        callId: c.id,
                        accept: true,
                        otherName: c.caller_name,
                      })
                    }
                    disabled={answerMutation.isPending}
                  >
                    {t("calls.accept")}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    onClick={() =>
                      answerMutation.mutate({
                        callId: c.id,
                        accept: false,
                        otherName: c.caller_name,
                      })
                    }
                    disabled={answerMutation.isPending}
                  >
                    {t("calls.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard icon={Phone} title={t("calls.availableCalls")} count={callable.length}>
        {loading || center.isPending ? (
          <CardsSkeleton cards={2} />
        ) : center.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("calls.error.load")}</p>
            <Button variant="outline" onClick={() => void center.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : !entityId ? (
          <SoftEmpty icon={Phone} message={t("calls.personalScope")} />
        ) : callable.length === 0 ? (
          <SoftEmpty
            icon={Phone}
            message={`${t("calls.noAvailable")} — ${t("calls.noAvailableHint")}`}
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{t("calls.availableHint")}</p>
            <ul className="space-y-3">
              {callable.map((a) => (
                <li
                  key={a.appointment_id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{a.other_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.title} · <span dir="ltr">{formatDateTime(a.starts_at)}</span>
                    </p>
                  </div>
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    onClick={() =>
                      startMutation.mutate({
                        appointmentId: a.appointment_id,
                        otherName: a.other_name,
                      })
                    }
                    disabled={startMutation.isPending || Boolean(active)}
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    {t("calls.call")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      <SectionCard icon={History} title={t("calls.history")} count={history.length}>
        {center.isPending ? (
          <CardsSkeleton cards={2} />
        ) : history.length === 0 ? (
          <SoftEmpty
            icon={History}
            message={`${t("calls.noHistory")} — ${t("calls.noHistoryHint")}`}
          />
        ) : (
          <ul className="space-y-2">
            {history.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.role === "caller" ? c.callee_name : c.caller_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span dir="ltr">{formatDateTime(c.started_at)}</span>
                    {c.duration_seconds != null ? (
                      <>
                        {" · "}
                        {t("calls.duration")}:{" "}
                        <span dir="ltr">{formatCallDuration(c.duration_seconds)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Badge variant="secondary">{t(`calls.statuses.${c.status}`) || c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
