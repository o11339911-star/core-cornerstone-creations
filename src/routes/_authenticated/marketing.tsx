import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Handshake, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { useT } from "@/i18n";
import {
  listMarketingContracts,
  listMarketingLeads,
  listMarketingVersions,
  recordMarketingLead,
  updateMarketingLeadStage,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing")({
  component: MarketerDashboard,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "لوحة المسوّق | ركيز" },
      {
        name: "description",
        content:
          "عقود التسويق السارية، المحتوى التسويقي المعتمد للقراءة فقط، وتسجيل العملاء المحتملين ومتابعة مراحلهم.",
      },
      { property: "og:title", content: "لوحة المسوّق | ركيز" },
      {
        property: "og:description",
        content: "واجهة مقصورة على وحدة التسويق: لا وصول لأي وحدة أخرى من وحدات المشروع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STAGES = ["new", "contacted", "qualified", "visit", "offer", "won", "lost"] as const;

function MarketerDashboard() {
  const t = useT();
  const qc = useQueryClient();

  const fetchContracts = useServerFn(listMarketingContracts);
  const fetchVersions = useServerFn(listMarketingVersions);
  const fetchLeads = useServerFn(listMarketingLeads);
  const addLead = useServerFn(recordMarketingLead);
  const setStage = useServerFn(updateMarketingLeadStage);

  const contracts = useQuery({
    queryKey: ["marketer-contracts"],
    queryFn: () => fetchContracts({ data: { profileId: null } }),
  });
  const versions = useQuery({
    queryKey: ["marketer-versions"],
    queryFn: () => fetchVersions({ data: { profileId: null } }),
  });
  const leads = useQuery({
    queryKey: ["marketer-leads"],
    queryFn: () => fetchLeads({ data: { contractId: null } }),
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contractId, setContractId] = useState<string | null>(null);

  const mLead = useMutation({
    mutationFn: addLead,
    onSuccess: () => {
      setName("");
      setPhone("");
      toast.success(t("marketing.newLead"));
      void qc.invalidateQueries({ queryKey: ["marketer-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mStage = useMutation({
    mutationFn: setStage,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["marketer-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (contracts.data ?? []).filter((c) => c.status === "active");
  const selected = contractId ?? active[0]?.id ?? null;

  if (contracts.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <CardsSkeleton cards={3} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("marketing.title")}
        subtitle={t("marketing.marketerSubtitle")}
        badge={<HeroBadge tone={active.length ? "success" : "warning"}>{active.length}</HeroBadge>}
      />

      <SectionCard icon={Handshake} title={t("marketing.myContracts")} count={active.length}>
        {active.length === 0 ? (
          <SoftEmpty icon={Handshake} message={t("marketing.noContracts")} />
        ) : (
          <ul className="space-y-2">
            {active.map((c) => (
              <li
                key={c.id}
                className={`rounded-lg border p-3 ${
                  selected === c.id ? "border-primary bg-secondary/40" : "border-border"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() => setContractId(c.id)}
                >
                  <p className="text-sm font-medium text-foreground">
                    {c.exclusivity} · {c.starts_on} → {c.ends_on}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.channels.join("، ") || "—"}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={FileText} title={t("marketing.readOnlyContent")}>
        {versions.isLoading ? (
          <CardsSkeleton cards={1} />
        ) : (versions.data ?? []).length === 0 ? (
          <SoftEmpty icon={FileText} message={t("marketing.noVersions")} />
        ) : (
          (versions.data ?? []).map((v) => (
            <FieldGrid key={v.id}>
              <Field label={t("marketing.listing")} value={v.title_ar} />
              <Field
                label={t("marketing.status")}
                value={v.status === "approved" ? t("marketing.approved") : t("marketing.draft")}
              />
              <Field
                label="السعر"
                value={
                  v.listing_price != null
                    ? formatMoney(Number(v.listing_price), v.price_currency ?? "SAR")
                    : "—"
                }
              />
              <Field label="الوصف" value={v.description_ar ?? "—"} />
            </FieldGrid>
          ))
        )}
      </SectionCard>

      <SectionCard icon={Users} title={t("marketing.leads")} count={leads.data?.length ?? 0}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("marketing.newLead")}
          />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" />
          <Button
            disabled={!selected || name.trim().length < 2 || mLead.isPending}
            onClick={() =>
              selected &&
              mLead.mutate({
                data: {
                  contractId: selected,
                  fullName: name.trim(),
                  contactPhone: phone.trim() || null,
                  contactEmail: null,
                  channelCode: "external",
                  note: null,
                },
              })
            }
          >
            {t("marketing.newLead")}
          </Button>
        </div>
        {leads.isLoading ? (
          <CardsSkeleton cards={1} />
        ) : (leads.data ?? []).length === 0 ? (
          <SoftEmpty icon={Users} message={t("marketing.noLeads")} />
        ) : (
          <ul className="space-y-2">
            {(leads.data ?? []).map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.full_name}</p>
                  <p className="text-xs text-muted-foreground">{l.contact_phone ?? "—"}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {STAGES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={l.stage === s ? "default" : "outline"}
                      disabled={mStage.isPending}
                      onClick={() => mStage.mutate({ data: { leadId: l.id, stage: s } })}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
