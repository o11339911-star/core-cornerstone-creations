import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ShieldCheck } from "lucide-react";

import { CardsSkeleton, ErrorState, Num, SoftEmpty } from "@/components/rakeez";
import { formatDate } from "@/lib/format";
import { getPublicMedia } from "@/lib/media.functions";

export const Route = createFileRoute("/m/$token")({
  component: PublicMediaPage,
  errorComponent: () => <ErrorState />,
  head: () => ({
    meta: [
      { title: "جولة 360 معتمدة | ركيز" },
      {
        name: "description",
        content:
          "عرض عام لجولة تصوير 360 معتمدة عبر منصة ركيز. لا يُعرض إلا ما اعتمده مالك المشروع بعد الطمس، ويمكن سحب النشر في أي وقت.",
      },
      { property: "og:title", content: "جولة 360 معتمدة | ركيز" },
      {
        property: "og:description",
        content: "مشهد 360 منشور بموافقة المالك عبر منصة ركيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PublicMediaPage() {
  const { token } = Route.useParams();
  const fetchMedia = useServerFn(getPublicMedia);
  const media = useQuery({
    queryKey: ["public-media", token],
    queryFn: () => fetchMedia({ data: { token } }),
    retry: false,
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10" dir="rtl">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Camera className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">جولة 360 معتمدة</h1>
          <p className="text-sm text-muted-foreground">
            منشورة عبر منصة ركيز بموافقة مالك المشروع.
          </p>
        </div>
      </header>

      {media.isLoading ? (
        <CardsSkeleton cards={1} />
      ) : media.isError ? (
        <ErrorState onRetry={() => void media.refetch()} />
      ) : !media.data ? (
        <SoftEmpty icon={ShieldCheck} message="الرابط غير صالح أو تم سحب النشر." />
      ) : (
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
          <div className="aspect-video w-full bg-muted">
            <img
              src={media.data.url}
              alt={`مشهد 360: ${media.data.title}`}
              className="size-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="space-y-1 p-5">
            <h2 className="text-lg font-semibold text-foreground">{media.data.title}</h2>
            <p className="text-sm text-muted-foreground">
              تاريخ النشر:{" "}
              <Num>{formatDate(media.data.published_at)}</Num>
            </p>
          </div>
        </article>
      )}
    </main>
  );
}
