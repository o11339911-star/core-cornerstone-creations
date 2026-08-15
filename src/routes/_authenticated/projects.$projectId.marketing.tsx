import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Coins,
  FileText,
  Handshake,
  Home,
  Megaphone,
  Package,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  activateMarketingContract,
  approveMarketingVersion,
  createMarketingProfile,
  createMarketingVersion,
  issueMarketingPackage,
  listMarketingAssets,
  listMarketingContractAmounts,
  listMarketingContractUnits,
  listMarketingContracts,
  listMarketingLeads,
  listMarketingPackages,
  listMarketingVersions,
  getMarketingProfile,
  revokeMarketingPackage,
  terminateMarketingContract,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/marketing")({
  component: ProjectMarketingPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "التسويق العقاري | ركيز" },
      {
        name: "description",
        content:
          "إدارة الملف التسويقي للمشروع: الجاهزية، الإصدارات المعتمدة، عقود المسوّقين ومبالغها، الوحدات، حقائب التسويق والعملاء المحتملون.",
      },
      { property: "og:title", content: "التسويق العقاري | ركيز" },
      {
        property: "og:description",
        content: "ملف تسويقي محكوم بالجاهزية والصلاحيات، بإصدارات معتمدة غير قابلة للتعديل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmtAmount(value: number | string, currency: string | null) {
  const n = typeof value === "string" ? Number(value) : value;
  return `${n.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${currency ?? "SAR"}`;
}

function ProjectMarketingPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const fetchProfile = useServerFn(getMarketingProfile);
  const fetchVersions = useServerFn(listMarketingVersions);
  const fetchContracts = useServerFn(listMarketingContracts);
  const fetchAmounts = useServerFn(listMarketingContractAmounts);
  const fetchUnits = useServerFn(listMarketingContractUnits);
  const fetchAssets = useServerFn(listMarketingAssets);
  const fetchPackages = useServerFn(listMarketingPackages);
  const fetchLeads = useServerFn(listMarketingLeads);

  const createProfile = useServerFn(createMarketingProfile);
  const newVersion = useServerFn(createMarketingVersion);
  const approveVersion = useServerFn(approveMarketingVersion);
  const activate = useServerFn(activateMarketingContract);
  const terminate = useServerFn(terminateMarketingContract);
  const issuePkg = useServerFn(issueMarketingPackage);
  const revokePkg = useServerFn(revokeMarketingPackage);

  const profile = useQuery({
    queryKey: ["marketing-profile", projectId],
    queryFn: () => fetchProfile({ data: { projectId } }),
  });
  const profileId = profile.data?.id ?? null;

  const versions = useQuery({
    queryKey: ["marketing-versions", profileId],
    queryFn: () => fetchVersions({ data: { profileId } }),
    enabled: !!profileId,
  });
  const contracts = useQuery({
    queryKey: ["marketing-contracts", profileId],
    queryFn: () => fetchContracts({ data: { profileId } }),
    enabled: !!profileId,
  });
  const amounts = useQuery({
    queryKey: ["marketing-amounts", profileId],
    queryFn: () => fetchAmounts({ data: { contractId: null } }),
    enabled: !!profileId,
  });
  const units = useQuery({
    queryKey: ["marketing-units", profileId],
    queryFn: () => fetchUnits({ data: { contractId: null } }),
    enabled: !!profileId,
  });
  const assets = useQuery({
    queryKey: ["marketing-assets", profileId],
    queryFn: () => fetchAssets({ data: { profileId } }),
    enabled: !!profileId,
  });
  const packages = useQuery({
    queryKey: ["marketing-packages", profileId],
    queryFn: () => fetchPackages({ data: { versionId: null } }),
    enabled: !!profileId,
  });
  const leads = useQuery({
    queryKey: ["marketing-leads", profileId],
    queryFn: () => fetchLeads({ data: { contractId: null } }),
    enabled: !!profileId,
  });

  const invalidateAll = () => {
    for (const key of [
      "marketing-profile",
      "marketing-versions",
      "marketing-contracts",
      "marketing-amounts",
      "marketing-units",
      "marketing-assets",
      "marketing-packages",
      "marketing-leads",
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const mProfile = useMutation({
    mutationFn: createProfile,
    onSuccess: () => {
      toast.success(t("marketing.createProfile"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mVersion = useMutation({
    mutationFn: newVersion,
    onSuccess: () => {
      setTitleAr("");
      setPrice("");
      setDescAr("");
      toast.success(t("marketing.newVersion"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mApprove = useMutation({
    mutationFn: approveVersion,
    onSuccess: () => {
      toast.success(t("marketing.approved"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mActivate = useMutation({
    mutationFn: activate,
    onSuccess: () => {
      toast.success(t("marketing.activate"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mTerminate = useMutation({
    mutationFn: terminate,
    onSuccess: () => {
      toast.success(t("marketing.terminate"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mIssue = useMutation({
    mutationFn: issuePkg,
    onSuccess: () => {
      toast.success(t("marketing.issuePackage"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mRevoke = useMutation({
    mutationFn: revokePkg,
    onSuccess: () => {
      toast.success(t("marketing.revoke"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [titleAr, setTitleAr] = useState("");
  const [descAr, setDescAr] = useState("");
  const [price, setPrice] = useState("");

  if (profile.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <CardsSkeleton cards={4} />
      </div>
    );
  }

  const approvedVersions = (versions.data ?? []).filter((v) => v.status === "approved");
  const activeContracts = (contracts.data ?? []).filter((c) => c.status === "active");

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("marketing.title")}
        subtitle={t("marketing.subtitle")}
        badge={
          profile.data ? (
            <HeroBadge tone={profile.data.status === "active" ? "success" : "neutral"}>
              {profile.data.status}
            </HeroBadge>
          ) : (
            <HeroBadge tone="warning">{t("marketing.noProfile")}</HeroBadge>
          )
        }
      />

      <SectionCard icon={ShieldCheck} title={t("marketing.readiness")}>
        {profile.data ? (
          <FieldGrid>
            <Field
              label={t("marketing.basis")}
              value={
                profile.data.readiness_basis === "off_plan"
                  ? t("marketing.basisOffPlan")
                  : t("marketing.basisReady")
              }
            />
            <Field label={t("marketing.status")} value={profile.data.status} />
            <Field label={t("marketing.channelMode")} value={profile.data.channel_mode} />
          </FieldGrid>
        ) : (
          <SoftEmpty
            icon={Megaphone}
            message={t("marketing.noProfile")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  size="sm"
                  disabled={mProfile.isPending}
                  onClick={() =>
                    mProfile.mutate({
                      data: { projectId, readinessBasis: "ready", channelMode: "both" },
                    })
                  }
                >
                  {t("marketing.basisReady")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mProfile.isPending}
                  onClick={() =>
                    mProfile.mutate({
                      data: { projectId, readinessBasis: "off_plan", channelMode: "both" },
                    })
                  }
                >
                  {t("marketing.basisOffPlan")}
                </Button>
              </div>
            }
          />
        )}
      </SectionCard>

      {profileId ? (
        <>
          <SectionCard
            icon={FileText}
            title={t("marketing.versions")}
            count={versions.data?.length ?? 0}
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Input
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder={t("marketing.listing")}
              />
              <Input
                value={price}
                inputMode="decimal"
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
              <Button
                disabled={titleAr.trim().length < 3 || mVersion.isPending}
                onClick={() =>
                  mVersion.mutate({
                    data: {
                      profileId,
                      titleAr: titleAr.trim(),
                      titleEn: null,
                      descriptionAr: descAr.trim() || null,
                      descriptionEn: null,
                      listingPrice: price ? Number(price) : null,
                      priceCurrency: "SAR",
                    },
                  })
                }
              >
                {t("marketing.newVersion")}
              </Button>
              <Textarea
                className="sm:col-span-3"
                value={descAr}
                onChange={(e) => setDescAr(e.target.value)}
                placeholder={t("marketing.readOnlyContent")}
                rows={2}
              />
            </div>
            {versions.isLoading ? (
              <CardsSkeleton cards={2} />
            ) : (versions.data ?? []).length === 0 ? (
              <SoftEmpty icon={FileText} message={t("marketing.noVersions")} />
            ) : (
              <ul className="space-y-2">
                {(versions.data ?? []).map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        #{v.version_no} — {v.title_ar}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.listing_price != null
                          ? fmtAmount(v.listing_price, v.price_currency)
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {v.status === "approved" ? t("marketing.approved") : t("marketing.draft")}
                      </span>
                      {v.status !== "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mApprove.isPending}
                          onClick={() => mApprove.mutate({ data: { versionId: v.id } })}
                        >
                          {t("marketing.approve")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            icon={Handshake}
            title={t("marketing.contracts")}
            count={contracts.data?.length ?? 0}
          >
            {contracts.isLoading ? (
              <CardsSkeleton cards={2} />
            ) : (contracts.data ?? []).length === 0 ? (
              <SoftEmpty icon={Handshake} message={t("marketing.noContracts")} />
            ) : (
              <ul className="space-y-3">
                {(contracts.data ?? []).map((c) => {
                  const cAmounts = (amounts.data ?? []).filter((a) => a.contract_id === c.id);
                  const cUnits = (units.data ?? []).filter((u) => u.contract_id === c.id);
                  return (
                    <li key={c.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {c.exclusivity} · {c.starts_on} → {c.ends_on}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.channels.join("، ") || "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {c.status}
                          </span>
                          {c.status === "draft" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mActivate.isPending}
                              onClick={() => mActivate.mutate({ data: { contractId: c.id } })}
                            >
                              {t("marketing.activate")}
                            </Button>
                          ) : null}
                          {c.status === "active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mTerminate.isPending}
                              onClick={() =>
                                mTerminate.mutate({
                                  data: {
                                    contractId: c.id,
                                    reason: "إنهاء العقد من مالك المشروع عبر لوحة التسويق.",
                                  },
                                })
                              }
                            >
                              {t("marketing.terminate")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Coins className="size-3.5" aria-hidden="true" />
                          <span>{t("marketing.amounts")}:</span>
                          <span className="text-foreground">
                            {cAmounts.length
                              ? cAmounts
                                  .map((a) => `${a.kind} ${fmtAmount(a.amount, a.currency)}`)
                                  .join(" · ")
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Home className="size-3.5" aria-hidden="true" />
                          <span>{t("marketing.units")}:</span>
                          <span className="text-foreground">{cUnits.length}</span>
                        </div>
                      </dl>
                      {c.status === "active" && approvedVersions[0] ? (
                        <Button
                          className="mt-3"
                          size="sm"
                          disabled={mIssue.isPending}
                          onClick={() =>
                            mIssue.mutate({
                              data: {
                                versionId: approvedVersions[0]!.id,
                                contractId: c.id,
                                expiresAt: new Date(
                                  Date.now() + 30 * 86400000,
                                ).toISOString(),
                                channelCode: "external",
                                watermarkText: null,
                              },
                            })
                          }
                        >
                          {t("marketing.issuePackage")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            icon={BadgeCheck}
            title={t("marketing.assets")}
            count={assets.data?.length ?? 0}
          >
            {(assets.data ?? []).length === 0 ? (
              <SoftEmpty icon={BadgeCheck} message={t("marketing.assets")} />
            ) : (
              <ul className="space-y-2 text-sm">
                {(assets.data ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <span className="truncate text-foreground">{a.document_id}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString("ar")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            icon={Package}
            title={t("marketing.packages")}
            count={packages.data?.length ?? 0}
          >
            {packages.isLoading ? (
              <CardsSkeleton cards={1} />
            ) : (packages.data ?? []).length === 0 ? (
              <SoftEmpty icon={Package} message={t("marketing.noPackages")} />
            ) : (
              <ul className="space-y-2">
                {(packages.data ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {t("marketing.packageNo")} {p.package_no}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        /mp/{p.verify_token}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/mp/${p.verify_token}`,
                          );
                          toast.success(t("marketing.copied"));
                        }}
                      >
                        {t("marketing.verifyLink")}
                      </Button>
                      {p.revoked_at ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={mRevoke.isPending}
                          onClick={() => mRevoke.mutate({ data: { packageId: p.id } })}
                        >
                          {t("marketing.revoke")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={Users} title={t("marketing.leads")} count={leads.data?.length ?? 0}>
            {leads.isLoading ? (
              <CardsSkeleton cards={1} />
            ) : (leads.data ?? []).length === 0 ? (
              <SoftEmpty icon={Users} message={t("marketing.noLeads")} />
            ) : (
              <ul className="space-y-2">
                {(leads.data ?? []).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="truncate text-foreground">{l.full_name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {l.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <p className="text-xs text-muted-foreground">
            عدد العقود السارية: {activeContracts.length}
          </p>
        </>
      ) : null}
    </div>
  );
}
