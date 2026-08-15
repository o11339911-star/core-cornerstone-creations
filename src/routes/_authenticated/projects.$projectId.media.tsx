import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, CheckCheck, Eye, Link2, MapPin, ShieldCheck } from "lucide-react";

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
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, import { formatDateTime } from "@/lib/format";
  approveMediaAsset,
  attachBlurredMediaVersion,
  checkInMediaShoot,
  createMediaUploadUrl,
  getMediaObjectUrl,
  listMediaAssets,
  listMediaPublications,
  listMediaShoots,
  publishMediaAsset,
  registerMediaAsset,
  requestMediaShoot,
  reviewMediaAsset,
  revokeMediaPublication,
  submitMediaAsset,
  withdrawMediaAsset,
  RAW_BUCKET,
} from "@/lib/media.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/media")({
  component: ProjectMediaPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "تصوير 360 درجة | ركيز" },
      {
        name: "description",
        content:
          "إدارة جولات التصوير الـ360 للمشروع: طلبات التصوير، حضور المصوّر، الطمس اليدوي المُقرّ به، المراجعة والاعتماد، ثم النشر العام القابل للسحب.",
      },
      { property: "og:title", content: "تصوير 360 درجة | ركيز" },
      {
        property: "og:description",
        content: "لا يُنشر أي مشهد قبل طمسه يدويًا واعتماده من المالك، والنشر قابل للسحب فورًا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_KEY: Record<string, string> = {
  draft: "media.statusDraft",
  pending_review: "media.statusPendingReview",
  review_approved: "media.statusReviewApproved",
  owner_approved: "media.statusOwnerApproved",
  rejected: "media.statusRejected",
  withdrawn: "media.statusWithdrawn",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return formatDateTime(value);
}

function ProjectMediaPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const fetchShoots = useServerFn(listMediaShoots);
  const fetchAssets = useServerFn(listMediaAssets);
  const fetchPubs = useServerFn(listMediaPublications);

  const createShoot = useServerFn(requestMediaShoot);
  const checkIn = useServerFn(checkInMediaShoot);
  const signUpload = useServerFn(createMediaUploadUrl);
  const registerAsset = useServerFn(registerMediaAsset);
  const attachBlur = useServerFn(attachBlurredMediaVersion);
  const submitAsset = useServerFn(submitMediaAsset);
  const reviewAsset = useServerFn(reviewMediaAsset);
  const approveAsset = useServerFn(approveMediaAsset);
  const withdrawAsset = useServerFn(withdrawMediaAsset);
  const publishAsset = useServerFn(publishMediaAsset);
  const revokePub = useServerFn(revokeMediaPublication);
  const objectUrl = useServerFn(getMediaObjectUrl);

  const shoots = useQuery({
    queryKey: ["media-shoots", projectId],
    queryFn: () => fetchShoots({ data: { projectId } }),
  });
  const assets = useQuery({
    queryKey: ["media-assets", projectId],
    queryFn: () => fetchAssets({ data: { projectId } }),
  });
  const pubs = useQuery({
    queryKey: ["media-pubs", projectId],
    queryFn: () => fetchPubs({ data: { projectId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["media-shoots", projectId] });
    void qc.invalidateQueries({ queryKey: ["media-assets", projectId] });
    void qc.invalidateQueries({ queryKey: ["media-pubs", projectId] });
  };

  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [assetTitle, setAssetTitle] = useState("");
  const [activeShoot, setActiveShoot] = useState<string | null>(null);
  const [ackText, setAckText] = useState("");
  const [blurTarget, setBlurTarget] = useState<string | null>(null);
  const rawInput = useRef<HTMLInputElement>(null);
  const blurInput = useRef<HTMLInputElement>(null);

  const shootMutation = useMutation({
    mutationFn: () =>
      createShoot({
        data: {
          projectId,
          propertyId: null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      setScheduledAt("");
      setNotes("");
      toast.success(t("common.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function uploadTo(shootId: string, file: File, blurred: boolean) {
    const target = await signUpload({
      data: { projectId, shootId, fileName: file.name, blurred },
    });
    const upload = await supabase.storage
      .from(RAW_BUCKET)
      .uploadToSignedUrl(target.path, target.token, file);
    if (upload.error) throw new Error(upload.error.message);
    return target.path;
  }

  const uploadAssetMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeShoot) throw new Error(t("media.noShoots"));
      if (assetTitle.trim().length < 2) throw new Error(t("media.assetTitle"));
      const path = await uploadTo(activeShoot, file, false);
      return registerAsset({
        data: { shootId: activeShoot, title: assetTitle.trim(), rawObjectPath: path },
      });
    },
    onSuccess: () => {
      setAssetTitle("");
      toast.success(t("common.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blurMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!blurTarget) throw new Error(t("media.blurRequired"));
      if (ackText.trim().length < 10) throw new Error(t("media.blurRequired"));
      const asset = assets.data?.find((a) => a.id === blurTarget);
      if (!asset) throw new Error(t("media.noAssets"));
      const path = await uploadTo(asset.shoot_id, file, true);
      return attachBlur({ data: { assetId: blurTarget, objectPath: path, ackText: ackText.trim() } });
    },
    onSuccess: () => {
      setAckText("");
      setBlurTarget(null);
      toast.success(t("common.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: async (input: { kind: string; id: string }) => {
      switch (input.kind) {
        case "check_in":
          return checkIn({ data: { shootId: input.id, lat: null, lng: null, accuracyM: null } });
        case "submit":
          return submitAsset({ data: { assetId: input.id } });
        case "review_ok":
          return reviewAsset({ data: { assetId: input.id, approve: true, reason: null } });
        case "review_no":
          return reviewAsset({
            data: { assetId: input.id, approve: false, reason: "مراجعة: يلزم تحسين الطمس أو الجودة" },
          });
        case "approve":
          return approveAsset({ data: { assetId: input.id, approve: true, reason: null } });
        case "reject":
          return approveAsset({
            data: { assetId: input.id, approve: false, reason: "غير معتمد من المالك" },
          });
        case "withdraw":
          return withdrawAsset({ data: { assetId: input.id, reason: "سحب الاعتماد بقرار المالك" } });
        case "publish":
          return publishAsset({ data: { assetId: input.id } });
        case "revoke":
          return revokePub({ data: { publicationId: input.id, reason: "سحب النشر بقرار المالك" } });
        default:
          throw new Error("UNKNOWN_ACTION");
      }
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMutation({
    mutationFn: (assetId: string) =>
      objectUrl({ data: { assetId, variant: "blurred" as const } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener,noreferrer"),
    onError: (e: Error) => toast.error(e.message),
  });

  const approvedCount = (assets.data ?? []).filter((a) => a.status === "owner_approved").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <PageHero
        title={t("media.title")}
        subtitle={t("media.subtitle")}
        badge={
          <span className="flex flex-wrap gap-2">
            <HeroBadge>{`${t("media.assets")}: ${assets.data?.length ?? 0}`}</HeroBadge>
            <HeroBadge>{`${t("media.statusOwnerApproved")}: ${approvedCount}`}</HeroBadge>
            <HeroBadge>{`${t("media.publications")}: ${(pubs.data ?? []).filter((p) => !p.revoked_at).length}`}</HeroBadge>
          </span>
        }
      />

      <SectionCard icon={Camera} title={t("media.shoots")} count={shoots.data?.length ?? 0}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            type="datetime-local"
            aria-label={t("media.scheduledAt")}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="min-h-11"
          />
          <Input
            aria-label={t("media.notes")}
            placeholder={t("media.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-11 sm:col-span-2"
          />
        </div>
        <Button
          className="mt-3 min-h-11"
          onClick={() => shootMutation.mutate()}
          disabled={shootMutation.isPending}
        >
          {shootMutation.isPending ? t("common.loading") : t("media.newShoot")}
        </Button>

        <div className="mt-4">
          {shoots.isLoading ? (
            <CardsSkeleton cards={2} />
          ) : shoots.isError ? (
            <ErrorState onRetry={() => void shoots.refetch()} />
          ) : (shoots.data ?? []).length === 0 ? (
            <SoftEmpty icon={Camera} message={t("media.noShoots")} />
          ) : (
            <ul className="space-y-3">
              {shoots.data!.map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-card p-4">
                  <FieldGrid>
                    <Field label={t("media.scheduledAt")} value={fmtDate(s.scheduled_at)} />
                    <Field label={t("common.status")} value={s.status} />
                    <Field label={t("media.notes")} value={s.notes ?? "—"} />
                  </FieldGrid>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => act.mutate({ kind: "check_in", id: s.id })}
                      disabled={act.isPending}
                    >
                      <MapPin className="size-4" aria-hidden="true" />
                      {t("media.checkIn")}
                    </Button>
                    <Button
                      variant={activeShoot === s.id ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => setActiveShoot(s.id)}
                    >
                      {t("media.newAsset")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {activeShoot ? (
        <SectionCard icon={Camera} title={t("media.newAsset")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label={t("media.assetTitle")}
              placeholder={t("media.assetTitle")}
              value={assetTitle}
              onChange={(e) => setAssetTitle(e.target.value)}
              className="min-h-11"
            />
            <input
              ref={rawInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAssetMutation.mutate(f);
                e.target.value = "";
              }}
            />
            <Button
              className="min-h-11"
              onClick={() => rawInput.current?.click()}
              disabled={uploadAssetMutation.isPending}
            >
              {uploadAssetMutation.isPending ? t("media.uploading") : t("media.upload")}
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard icon={ShieldCheck} title={t("media.assets")} count={assets.data?.length ?? 0}>
        {assets.isLoading ? (
          <CardsSkeleton cards={3} />
        ) : assets.isError ? (
          <ErrorState onRetry={() => void assets.refetch()} />
        ) : (assets.data ?? []).length === 0 ? (
          <SoftEmpty icon={Camera} message={t("media.noAssets")} />
        ) : (
          <ul className="space-y-3">
            {assets.data!.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-card p-4">
                <FieldGrid>
                  <Field label={t("media.assetTitle")} value={a.title} />
                  <Field
                    label={t("common.status")}
                    value={t(STATUS_KEY[a.status] ?? "media.statusDraft")}
                  />
                  <Field
                    label={t("media.blurred")}
                    value={a.blurred_object_path ? t("media.blurAck") : t("media.blurRequired")}
                  />
                  <Field label={t("media.publishedAt")} value={fmtDate(a.approved_at)} />
                </FieldGrid>
                {a.rejection_reason ? (
                  <p className="mt-2 text-sm text-destructive">{a.rejection_reason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setBlurTarget(blurTarget === a.id ? null : a.id)}
                  >
                    {t("media.attachBlur")}
                  </Button>
                  {a.blurred_object_path ? (
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => preview.mutate(a.id)}
                      disabled={preview.isPending}
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      {t("media.openMedia")}
                    </Button>
                  ) : null}
                  {["draft", "rejected"].includes(a.status) ? (
                    <Button
                      className="min-h-11"
                      onClick={() => act.mutate({ kind: "submit", id: a.id })}
                      disabled={act.isPending || !a.blurred_object_path}
                    >
                      {t("media.submit")}
                    </Button>
                  ) : null}
                  {a.status === "pending_review" ? (
                    <>
                      <Button
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "review_ok", id: a.id })}
                        disabled={act.isPending}
                      >
                        {t("media.review")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "review_no", id: a.id })}
                        disabled={act.isPending}
                      >
                        {t("media.reject")}
                      </Button>
                    </>
                  ) : null}
                  {a.status === "review_approved" ? (
                    <>
                      <Button
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "approve", id: a.id })}
                        disabled={act.isPending}
                      >
                        <CheckCheck className="size-4" aria-hidden="true" />
                        {t("media.approve")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "reject", id: a.id })}
                        disabled={act.isPending}
                      >
                        {t("media.reject")}
                      </Button>
                    </>
                  ) : null}
                  {a.status === "owner_approved" ? (
                    <>
                      <Button
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "publish", id: a.id })}
                        disabled={act.isPending}
                      >
                        <Link2 className="size-4" aria-hidden="true" />
                        {t("media.publish")}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "withdraw", id: a.id })}
                        disabled={act.isPending}
                      >
                        {t("media.withdraw")}
                      </Button>
                    </>
                  ) : null}
                </div>

                {blurTarget === a.id ? (
                  <div className="mt-3 space-y-2 rounded-lg bg-secondary/60 p-3">
                    <Textarea
                      aria-label={t("media.blurAck")}
                      placeholder={t("media.blurAckPlaceholder")}
                      value={ackText}
                      onChange={(e) => setAckText(e.target.value)}
                      rows={3}
                    />
                    <input
                      ref={blurInput}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) blurMutation.mutate(f);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      className="min-h-11"
                      onClick={() => blurInput.current?.click()}
                      disabled={blurMutation.isPending || ackText.trim().length < 10}
                    >
                      {blurMutation.isPending ? t("media.uploading") : t("media.attachBlur")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={Link2} title={t("media.publications")} count={pubs.data?.length ?? 0}>
        {pubs.isLoading ? (
          <CardsSkeleton cards={2} />
        ) : pubs.isError ? (
          <ErrorState onRetry={() => void pubs.refetch()} />
        ) : (pubs.data ?? []).length === 0 ? (
          <SoftEmpty icon={Link2} message={t("media.noPublications")} />
        ) : (
          <ul className="space-y-3">
            {pubs.data!.map((p) => {
              const link = `${typeof window === "undefined" ? "" : window.location.origin}/m/${p.public_token}`;
              return (
                <li key={p.id} className="rounded-lg border border-border bg-card p-4">
                  <FieldGrid>
                    <Field label={t("media.publishedAt")} value={fmtDate(p.published_at)} />
                    <Field
                      label={t("common.status")}
                      value={p.revoked_at ? t("media.revoke") : t("media.publicLink")}
                    />
                  </FieldGrid>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        void navigator.clipboard.writeText(link);
                        toast.success(t("media.copied"));
                      }}
                    >
                      {t("media.publicLink")}
                    </Button>
                    {!p.revoked_at ? (
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => act.mutate({ kind: "revoke", id: p.id })}
                        disabled={act.isPending}
                      >
                        {t("media.revoke")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
