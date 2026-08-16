import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Inbox } from "lucide-react";

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
import { listInboxRequests } from "@/lib/requests.functions";
import { cn } from "@/lib/utils";
import { ArchiveButton } from "@/components/archive/archive-button";

export const Route = createFileRoute("/_authenticated/requests/")({
  component: RequestsInboxPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الطلبات | ركيز" },
      {
        name: "description",
        content: "كل الطلبات الموجهة إليك أو التي أنشأتها عبر مشاريع ركيز في مكان واحد.",
      },
      { property: "og:title", content: "الطلبات | ركيز" },
      {
        property: "og:description",
        content: "متابعة الطلبات حسب الحساب النشط مع تمييز ما ينتظر إجراءك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FilterKey = "assigned" | "created" | "all";
const FILTERS: FilterKey[] = ["assigned", "created", "all"];

function RequestsInboxPage() {
  const t = useT();
  const { activeEntity, loading } = useAccountUi();
  const fetchInbox = useServerFn(listInboxRequests);
  const [filter, setFilter] = React.useState<FilterKey>("assigned");

  const entityId = activeEntity?.id ?? null;

  const list = useQuery({
    queryKey: ["requests-inbox", entityId, filter],
    queryFn: () => fetchInbox({ data: { entityId, filter, status: null } }),
    enabled: !loading,
  });

  const rows = list.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero
        title={t("requests.inbox.title")}
        subtitle={t("requests.inbox.subtitle")}
        badge={<HeroBadge>{t("requests.title")}</HeroBadge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("requests.inbox.title")}>
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
              filter === key
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`requests.inbox.${key}`)}
          </button>
        ))}
      </div>

      <SectionCard icon={Inbox} title={t("requests.list")} count={rows.length}>
        {loading || list.isPending ? (
          <CardsSkeleton cards={3} />
        ) : list.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("requests.inbox.error")}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <SoftEmpty
            icon={Inbox}
            message={
              !entityId && filter === "assigned"
                ? t("requests.inbox.personalScope")
                : `${t("requests.inbox.empty")} — ${t("requests.inbox.emptyHint")}`
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute end-3 top-3 z-10">
                  <ArchiveButton
                    compact
                    title={r.subject}
                    kind="request"
                    sourceTable="requests"
                    sourceId={r.id}
                  />
                </span>
                <Link
                  to="/requests/$requestId"
                  params={{ requestId: r.id }}
                  className="flex min-h-11 flex-col gap-2 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="text-xs font-medium text-muted-foreground">
                      {r.request_no}
                    </span>
                    <Badge variant="secondary">
                      {t(`requests.statuses.${r.status}`) || r.status}
                    </Badge>
                    {r.action_required ? (
                      <Badge className="bg-warning-soft text-warning">
                        {t("requests.inbox.actionRequired")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{r.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("requests.inbox.project")}: {r.project_name} · {t("requests.inbox.updated")}:{" "}
                    <span dir="ltr">{formatDateTime(r.updated_at)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
