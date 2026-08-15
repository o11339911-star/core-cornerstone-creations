import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Globe,
  Mail,
  MapPin,
  Phone,
  Sparkles,
} from "lucide-react";

import { PageHero, HeroBadge, SectionCard, SoftEmpty } from "@/components/rakeez/dashboard-kit";
import { getPublicEntityProfile, type PublicEntityProfile } from "@/lib/entity-public.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/e/$slug")({
  loader: async ({ params }) => {
    const profile = await getPublicEntityProfile({ data: { slug: params.slug } });
    if (!profile) throw notFound();
    return { profile };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.profile;
    if (!p) {
      return {
        meta: [
          { title: "الملف غير متاح — ركيز" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${p.display_name_ar} — ملف الكيان على ركيز`;
    const description =
      (p.bio_ar ?? p.activity_ar ?? "ملف عام لكيان هندسي على منصة ركيز").slice(0, 155);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
        ...(p.logo_url?.startsWith("https://")
          ? [
              { property: "og:image", content: p.logo_url },
              { name: "twitter:image", content: p.logo_url },
            ]
          : []),
      ],
    };
  },
  component: PublicEntityPage,
  notFoundComponent: () => <Unavailable />,
  errorComponent: () => <Unavailable />,
});

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">الصفحة غير متاحة</h1>
      <p className="text-sm text-muted-foreground">
        لا يوجد ملف عام منشور على هذا الرابط.
      </p>
    </main>
  );
}

function PublicEntityPage() {
  const { profile } = Route.useLoaderData() as { profile: PublicEntityProfile };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <PageHero
        title={profile.display_name_ar}
        subtitle={profile.activity_ar ?? profile.display_name_en ?? undefined}
        badge={
          profile.is_verified ? (
            <HeroBadge tone="success">
              <BadgeCheck className="me-1 size-3.5" aria-hidden="true" /> كيان موثّق
            </HeroBadge>
          ) : undefined
        }
        aside={
          profile.logo_url ? (
            <img
              src={profile.logo_url}
              alt={`شعار ${profile.display_name_ar}`}
              loading="lazy"
              className="size-20 rounded-xl border border-border object-contain p-2"
            />
          ) : undefined
        }
      >
        {profile.regions.length > 0 ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" />
            {profile.regions.join(" · ")}
          </p>
        ) : null}
      </PageHero>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard icon={Building2} title="نبذة">
            {profile.bio_ar || profile.bio_en ? (
              <p className="whitespace-pre-line text-sm leading-7 text-foreground">
                {profile.bio_ar ?? profile.bio_en}
              </p>
            ) : (
              <SoftEmpty icon={Building2} message="لم يضف هذا الكيان نبذة تعريفية بعد." />
            )}
          </SectionCard>

          <SectionCard icon={Sparkles} title="سابقة الأعمال" count={profile.portfolio.length}>
            {profile.portfolio.length === 0 ? (
              <SoftEmpty icon={Sparkles} message="لا توجد أعمال منشورة في الملف العام." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {profile.portfolio.map((item, i) => (
                  <li
                    key={`${item.title_ar}-${i}`}
                    className="rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-card"
                  >
                    <h3 className="text-sm font-semibold text-foreground">{item.title_ar}</h3>
                    {item.summary_ar ? (
                      <p className="mt-1 line-clamp-3 text-xs leading-6 text-muted-foreground">
                        {item.summary_ar}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      {item.city ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" aria-hidden="true" />
                          {[item.city, item.district].filter(Boolean).join(" — ")}
                        </span>
                      ) : null}
                      {item.completed_on ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" aria-hidden="true" />
                          {formatDate(item.completed_on)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard icon={Sparkles} title="الخدمات" count={profile.services.length}>
            {profile.services.length === 0 ? (
              <SoftEmpty icon={Sparkles} message="لم تُحدَّد خدمات معلنة." />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {profile.services.map((s) => (
                  <li
                    key={s}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={Mail} title="التواصل المعلن">
            {profile.website_url || profile.public_email || profile.public_phone ? (
              <ul className="space-y-2 text-sm">
                {profile.website_url ? (
                  <li className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
                    <a
                      href={profile.website_url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      الموقع الإلكتروني
                    </a>
                  </li>
                ) : null}
                {profile.public_email ? (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-foreground">{profile.public_email}</span>
                  </li>
                ) : null}
                {profile.public_phone ? (
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-foreground">{profile.public_phone}</span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <SoftEmpty icon={Mail} message="لم يعلن هذا الكيان وسائل تواصل عامة." />
            )}
          </SectionCard>

          <p className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-6 text-muted-foreground">
            علامة التوثيق مؤشر عرضي فقط ولا تمنح أي أفضلية أو صلاحية داخل المنصة. هذه الصفحة
            تعرض بيانات عامة اختار الكيان نشرها.
          </p>
        </div>
      </div>
    </main>
  );
}
