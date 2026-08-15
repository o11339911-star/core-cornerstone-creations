import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Store, MapPin, Sparkles } from "lucide-react";
import { formatNumber } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { getMyMemberships } from "@/lib/auth.functions";
import {
  listListingAreas,
  listServiceListings,
  publishServiceListing,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/marketplace")({
  component: MarketplacePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "سوق الخدمات | ركيز" },
      {
        name: "description",
        content:
          "إعلانات خدمات التصميم والإشراف والفحص والتصوير مع مناطق التغطية — هوية النشر هي الحساب النشط دائمًا.",
      },
      { property: "og:title", content: "سوق الخدمات | ركيز" },
      {
        property: "og:description",
        content: "سوق منفصل تمامًا عن بيانات المشاريع: التفاعل التجاري لا يمنح أي وصول لمشروع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KINDS: Array<{ value: string; label: string }> = [
  { value: "design", label: "تصميم" },
  { value: "supervision", label: "إشراف" },
  { value: "inspection", label: "فحص" },
  { value: "photography", label: "تصوير" },
  { value: "legal", label: "قانوني" },
  { value: "other", label: "أخرى" },
];

const kindLabel = (v: string) => KINDS.find((k) => k.value === v)?.label ?? v;

function MarketplacePage() {
  const qc = useQueryClient();
  const fetchListings = useServerFn(listServiceListings);
  const fetchAreas = useServerFn(listListingAreas);
  const fetchMemberships = useServerFn(getMyMemberships);
  const publish = useServerFn(publishServiceListing);

  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [form, setForm] = useState({
    entityId: "",
    serviceKind: "design",
    title: "",
    description: "",
    city: "",
    priceMin: "",
    priceMax: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const memberships = useQuery({
    queryKey: ["my-memberships"],
    queryFn: () => fetchMemberships(),
  });

  const listings = useQuery({
    queryKey: ["marketplace", "listings", kindFilter],
    queryFn: () => fetchListings({ data: { entityId: null, serviceKind: kindFilter } }),
  });

  const areas = useQuery({
    queryKey: ["marketplace", "areas", (listings.data ?? []).map((l) => l.id).join(",")],
    queryFn: () => fetchAreas({ data: { listingIds: (listings.data ?? []).map((l) => l.id) } }),
    enabled: (listings.data ?? []).length > 0,
  });

  const create = useMutation({
    mutationFn: () =>
      publish({
        data: {
          entityId: form.entityId,
          serviceKind: form.serviceKind,
          title: form.title.trim(),
          description: form.description.trim(),
          areas: form.city.trim()
            ? [{ country_code: "SA", region: null, city: form.city.trim() }]
            : [],
          priceMin: form.priceMin ? Number(form.priceMin) : null,
          priceMax: form.priceMax ? Number(form.priceMax) : null,
          publish: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم نشر الإعلان بهوية حسابك النشط");
      setForm((f) => ({ ...f, title: "", description: "", city: "", priceMin: "", priceMax: "" }));
      void qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "NOT_A_MEMBER_OF_ENTITY"
          ? "لا يمكنك النشر باسم كيان لا تنتمي إليه"
          : e.message === "ENTITY_READ_ONLY"
            ? "حساب الكيان في وضع القراءة فقط بعد انتهاء الاشتراك"
            : "تعذّر نشر الإعلان، حاول مرة أخرى",
      ),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.entityId) next['entityId'] = "اختر الكيان الناشر";
    if (form.title.trim().length < 4) next['title'] = "العنوان قصير جدًا (4 أحرف فأكثر)";
    if (form.description.trim().length < 20) next['description'] = "الوصف يحتاج 20 حرفًا فأكثر";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const rows = listings.data ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="سوق الخدمات"
        subtitle="أعلن عن خدمات كيانك ومناطق تغطيتها. هوية النشر تُشتق من حسابك النشط في الخادم — لا نشر باسم غيرك."
        badge={<HeroBadge>المرحلة 24</HeroBadge>}
      >
        <HeroBadge>{rows.length} إعلانًا</HeroBadge>
        <HeroBadge>منفصل عن بيانات المشاريع</HeroBadge>
      </PageHero>

      <SectionCard icon={Store} title="نشر إعلان خدمة">
        <FieldGrid>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">الكيان الناشر</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
            >
              <option value="">اختر الكيان…</option>
              {(memberships.data ?? []).map((m) => (
                <option key={m.entity.id} value={m.entity.id}>
                  {m.entity.name}
                </option>
              ))}
            </select>
            {errors['entityId'] ? (
              <span className="text-xs text-destructive">{errors['entityId']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">نوع الخدمة</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.serviceKind}
              onChange={(e) => setForm({ ...form, serviceKind: e.target.value })}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">العنوان</span>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="تصميم فلل سكنية"
            />
            {errors['title'] ? (
              <span className="text-xs text-destructive">{errors['title']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">مدينة التغطية</span>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="الرياض"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">أقل سعر (ريال)</span>
            <Input
              inputMode="numeric"
              dir="ltr"
              className="text-start"
              value={form.priceMin}
              onChange={(e) => setForm({ ...form, priceMin: e.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">أعلى سعر (ريال)</span>
            <Input
              inputMode="numeric"
              dir="ltr"
              className="text-start"
              value={form.priceMax}
              onChange={(e) => setForm({ ...form, priceMax: e.target.value })}
            />
          </label>
        </FieldGrid>

        <label className="mt-4 block space-y-1.5 text-sm">
          <span className="font-medium">وصف الخدمة</span>
          <Textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="اشرح نطاق الخدمة ومخرجاتها ومدتها التقديرية."
          />
          {errors['description'] ? (
            <span className="text-xs text-destructive">{errors['description']}</span>
          ) : null}
        </label>

        <div className="mt-4">
          <Button
            onClick={() => {
              if (validate()) create.mutate();
            }}
            disabled={create.isPending}
          >
            {create.isPending ? "جارٍ النشر…" : "نشر الإعلان"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        title="الإعلانات المنشورة"
        count={rows.length}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={kindFilter === null ? "default" : "outline"}
              onClick={() => setKindFilter(null)}
            >
              الكل
            </Button>
            {KINDS.map((k) => (
              <Button
                key={k.value}
                size="sm"
                variant={kindFilter === k.value ? "default" : "outline"}
                onClick={() => setKindFilter(k.value)}
              >
                {k.label}
              </Button>
            ))}
          </div>
        }
      >
        {listings.isLoading ? (
          <CardsSkeleton cards={3} />
        ) : listings.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">تعذّر تحميل الإعلانات.</p>
            <Button variant="outline" onClick={() => void listings.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <SoftEmpty
            icon={Sparkles}
            message="لا توجد إعلانات بعد — انشر أول إعلان خدمة لكيانك ليظهر هنا."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((l) => {
              const la = (areas.data ?? []).filter((a) => a.listing_id === l.id);
              return (
                <div key={l.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{l.title}</h3>
                    <Badge variant="secondary">{kindLabel(l.service_kind)}</Badge>
                    {l.status === "published" ? null : <Badge>{l.status}</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                    {l.description}
                  </p>
                  <div className="mt-3">
                    <FieldGrid>
                      <Field
                        label="نطاق السعر"
                        value={
                          l.price_min || l.price_max ? (
                            <span dir="ltr" className="inline-block">
                              {formatNumber(Number(l.price_min ?? 0))} –{" "}
                              {formatNumber(Number(l.price_max ?? 0))} SAR
                            </span>
                          ) : (
                            "غير محدد"
                          )
                        }
                      />
                      <Field
                        label="مناطق التغطية"
                        value={
                          la.length === 0 ? (
                            "غير محددة"
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <MapPin className="size-3.5" aria-hidden />
                              {la.map((a) => a.city ?? a.region ?? a.country_code).join("، ")}
                            </span>
                          )
                        }
                      />
                    </FieldGrid>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
