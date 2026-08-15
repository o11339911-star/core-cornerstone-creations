import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RakeezCard, TextField, TextAreaField, AsyncBoundary } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getMyEntityPublicProfile,
  saveEntityPublicProfile,
  setEntityPublishState,
  setEntitySlug,
} from "@/lib/entity-public.functions";

export const Route = createFileRoute("/_authenticated/entities/$entityId/public-profile")({
  component: PublicProfilePage,
  head: () => ({
    meta: [
      { title: "الملف العام للكيان — ركيز" },
      {
        name: "description",
        content:
          "تحرير الملف العام للكيان: الاسم التجاري والنشاط والخدمات والمناطق والنبذة، وتفعيل النشر ونشر سابقة الأعمال.",
      },
      { property: "og:title", content: "الملف العام للكيان — ركيز" },
      {
        property: "og:description",
        content: "الملف العام غير منشور افتراضيًا ولا يعرض أي بيانات خاصة أو مالية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FormState = {
  displayNameAr: string;
  displayNameEn: string;
  activityAr: string;
  services: string;
  regions: string;
  bioAr: string;
  logoUrl: string;
  websiteUrl: string;
  publicEmail: string;
  publicPhone: string;
};

const EMPTY: FormState = {
  displayNameAr: "",
  displayNameEn: "",
  activityAr: "",
  services: "",
  regions: "",
  bioAr: "",
  logoUrl: "",
  websiteUrl: "",
  publicEmail: "",
  publicPhone: "",
};

function splitList(value: string): string[] {
  return value
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function PublicProfilePage() {
  const { entityId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchProfile = useServerFn(getMyEntityPublicProfile);
  const save = useServerFn(saveEntityPublicProfile);
  const publish = useServerFn(setEntityPublishState);
  const renameSlug = useServerFn(setEntitySlug);

  const profileQuery = useQuery({
    queryKey: ["entity-public-profile", entityId],
    queryFn: () => fetchProfile({ data: { entityId } }),
  });

  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [slugInput, setSlugInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);

  const row = profileQuery.data;

  React.useEffect(() => {
    if (!row || loadedRef.current) return;
    loadedRef.current = true;
    setForm({
      displayNameAr: row.display_name_ar ?? "",
      displayNameEn: row.display_name_en ?? "",
      activityAr: row.activity_ar ?? "",
      services: (row.services ?? []).join("، "),
      regions: (row.regions ?? []).join("، "),
      bioAr: row.bio_ar ?? "",
      logoUrl: row.logo_url ?? "",
      websiteUrl: row.website_url ?? "",
      publicEmail: row.public_email ?? "",
      publicPhone: row.public_phone ?? "",
    });
    setSlugInput(row.slug ?? "");
  }, [row]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["entity-public-profile", entityId] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          entityId,
          displayNameAr: form.displayNameAr.trim(),
          displayNameEn: form.displayNameEn.trim() || null,
          activityAr: form.activityAr.trim() || null,
          activityEn: null,
          services: splitList(form.services),
          regions: splitList(form.regions),
          bioAr: form.bioAr.trim() || null,
          bioEn: null,
          logoUrl: form.logoUrl.trim() || null,
          websiteUrl: form.websiteUrl.trim() || null,
          publicEmail: form.publicEmail.trim() || null,
          publicPhone: form.publicPhone.trim() || null,
        },
      }),
    onSuccess: (slug) => {
      setError(null);
      setNotice(`تم الحفظ. الرابط العام: /e/${slug}`);
      setSlugInput(slug);
      void invalidate();
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (input: { isPublished: boolean; portfolioOptIn: boolean | null }) =>
      publish({ data: { entityId, ...input } }),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const slugMutation = useMutation({
    mutationFn: () => renameSlug({ data: { entityId, slug: slugInput } }),
    onSuccess: (slug) => {
      setSlugInput(slug);
      setNotice(`الرابط العام الآن: /e/${slug}`);
      void invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">الملف العام للكيان</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          حقول عامة فقط. الملف غير منشور افتراضيًا، ولا يُعرض أي بريد أو جوال أو مستند خاص
          مالم تُدخله هنا صراحة كوسيلة تواصل معلنة.
        </p>
      </header>

      <AsyncBoundary
        isLoading={profileQuery.isLoading}
        isError={profileQuery.isError}
        onRetry={() => void profileQuery.refetch()}
      >
        <div className="space-y-5">
          <RakeezCard title="بيانات العرض">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="الاسم التجاري (عربي)"
                value={form.displayNameAr}
                onChange={(e) => setForm((f) => ({ ...f, displayNameAr: e.target.value }))}
              />
              <TextField
                label="الاسم التجاري (إنجليزي)"
                value={form.displayNameEn}
                onChange={(e) => setForm((f) => ({ ...f, displayNameEn: e.target.value }))}
              />
              <TextField
                label="النشاط"
                value={form.activityAr}
                onChange={(e) => setForm((f) => ({ ...f, activityAr: e.target.value }))}
              />
              <TextField
                label="رابط الشعار (https فقط)"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              />
              <TextField
                label="الخدمات (افصل بفاصلة)"
                value={form.services}
                onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
              />
              <TextField
                label="المناطق (افصل بفاصلة)"
                value={form.regions}
                onChange={(e) => setForm((f) => ({ ...f, regions: e.target.value }))}
              />
              <TextField
                label="الموقع الإلكتروني"
                value={form.websiteUrl}
                onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              />
              <TextField
                label="بريد معلَن (اختياري)"
                value={form.publicEmail}
                onChange={(e) => setForm((f) => ({ ...f, publicEmail: e.target.value }))}
              />
              <TextField
                label="جوال معلَن (اختياري)"
                value={form.publicPhone}
                onChange={(e) => setForm((f) => ({ ...f, publicPhone: e.target.value }))}
              />
            </div>
            <div className="mt-4">
              <TextAreaField
                label="نبذة"
                rows={5}
                value={form.bioAr}
                onChange={(e) => setForm((f) => ({ ...f, bioAr: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || form.displayNameAr.trim().length < 2}
              >
                حفظ
              </Button>
            </div>
          </RakeezCard>

          {row ? (
            <RakeezCard title="النشر">
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground">تفعيل نشر الملف العام</span>
                  <Switch
                    checked={row.is_published}
                    onCheckedChange={(checked) =>
                      publishMutation.mutate({ isPublished: checked, portfolioOptIn: null })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground">
                    الموافقة على عرض سابقة الأعمال المنشورة
                  </span>
                  <Switch
                    checked={row.portfolio_opt_in}
                    onCheckedChange={(checked) =>
                      publishMutation.mutate({
                        isPublished: row.is_published,
                        portfolioOptIn: checked,
                      })
                    }
                  />
                </label>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <TextField
                      label="الرابط المختصر"
                      value={slugInput}
                      onChange={(e) => setSlugInput(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => slugMutation.mutate()}
                    disabled={slugMutation.isPending || slugInput.trim().length < 2}
                  >
                    تحديث الرابط
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  الرابط العام:{" "}
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={`/e/${row.slug}`}
                  >
                    /e/{row.slug}
                  </a>
                </p>
              </div>
            </RakeezCard>
          ) : null}

          {notice ? <p className="text-sm text-success">{notice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </AsyncBoundary>
    </main>
  );
}
