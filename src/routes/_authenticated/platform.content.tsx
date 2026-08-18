import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { FolderKanban, Megaphone, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminAction,
  CardsSkeleton,
  ErrorState,
  Num,
  PageHero,
  RefreshAction,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import {
  adminListProjects,
  adminRemovePublicContent,
  adminSetProjectState,
} from "@/lib/platform-manage.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/content")({
  component: PlatformContentPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المشاريع والمحتوى | إدارة ركيز" },
      {
        name: "description",
        content:
          "إدارة المشاريع والمحتوى العام في منصة ركيز: تعليق أو إلغاء مشروع وإزالة محتوى مخالف بمسار محوكم.",
      },
      { property: "og:title", content: "المشاريع والمحتوى | إدارة ركيز" },
      { property: "og:description", content: "تعليق المشاريع وإزالة المحتوى المخالف مع تسجيل التدقيق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  active: "نشط",
  draft: "مسودة",
  suspended: "معلّق",
  cancelled: "ملغى",
  completed: "مكتمل",
  archived: "مؤرشف",
};

const KINDS = [
  { value: "service_listing", label: "إعلان خدمة" },
  { value: "marketing_asset", label: "أصل تسويقي" },
  { value: "entity_public_profile", label: "ملف كيان عام" },
] as const;

function PlatformContentPage() {
  const queryClient = useQueryClient();
  const listProjects = useServerFn(adminListProjects);
  const setProjectState = useServerFn(adminSetProjectState);
  const removeContent = useServerFn(adminRemovePublicContent);

  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [kind, setKind] = React.useState<(typeof KINDS)[number]["value"]>("service_listing");
  const [contentId, setContentId] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const query = useQuery({
    queryKey: ["admin-projects", search],
    queryFn: () => listProjects({ data: search ? { q: search, limit: 50 } : { limit: 50 } }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="المشاريع والمحتوى"
        subtitle="تعليق أو إلغاء المشاريع وإزالة المحتوى العام المخالف — بسبب إلزامي وسجل تدقيق."
        aside={<RefreshAction onRefresh={() => void query.refetch()} busy={query.isFetching} />}
      />

      <SectionCard icon={FolderKanban} title="المشاريع" count={rows.length}>
        <div className="mb-4 space-y-1.5">
          <Label htmlFor="project-search">بحث باسم المشروع أو الكيان</Label>
          <Input
            id="project-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اكتب للبحث"
          />
        </div>

        {query.isPending ? (
          <CardsSkeleton cards={3} />
        ) : query.isError ? (
          <ErrorState
            description="تعذّر جلب المشاريع. حاول مرة أخرى."
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={FolderKanban} message="لا توجد مشاريع مطابقة." />
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.project_id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>
                    {STATUS_AR[p.status] ?? p.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.entity_id ? (
                    <Link
                      to="/platform/entity/$entityId"
                      params={{ entityId: p.entity_id }}
                      search={{ hint: p.entity_name ?? "" }}
                      className="text-primary hover:underline"
                    >
                      {p.entity_name ?? "كيان"}
                    </Link>
                  ) : (
                    "بدون كيان"
                  )}{" "}
                  · الإنشاء: <Num>{formatDateTime(p.created_at)}</Num>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdminAction
                    label="تعليق المشروع"
                    title="تعليق المشروع"
                    impact="سيتوقف العمل داخل المشروع لكل أطرافه حتى إعادة فتحه."
                    confirmLabel="تعليق"
                    destructive
                    onConfirm={async (reason) => {
                      const res = await setProjectState({
                        data: { projectId: p.project_id, action: "suspend", reason },
                      });
                      return { ok: res.ok, message: "message" in res ? res.message : undefined };
                    }}
                    onDone={invalidate}
                  />
                  <AdminAction
                    label="إلغاء المشروع"
                    title="إلغاء المشروع"
                    impact="سيُعلَّم المشروع ملغى ويُخفى من واجهات العمل، مع بقاء سجلّه للتدقيق."
                    confirmLabel="إلغاء المشروع"
                    destructive
                    confirmName={p.name}
                    onConfirm={async (reason) => {
                      const res = await setProjectState({
                        data: { projectId: p.project_id, action: "cancel", reason },
                      });
                      return { ok: res.ok, message: "message" in res ? res.message : undefined };
                    }}
                    onDone={invalidate}
                  />
                  <AdminAction
                    label="إعادة الفتح"
                    title="إعادة فتح المشروع"
                    impact="سيعود المشروع نشطًا ويستأنف أطرافه العمل."
                    confirmLabel="إعادة الفتح"
                    onConfirm={async (reason) => {
                      const res = await setProjectState({
                        data: { projectId: p.project_id, action: "reopen", reason },
                      });
                      return { ok: res.ok, message: "message" in res ? res.message : undefined };
                    }}
                    onDone={invalidate}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={Megaphone} title="إزالة محتوى عام مخالف">
        <p className="text-sm text-muted-foreground">
          تُخفى المادة من الواجهات العامة فورًا مع بقاء أثرها في سجل التدقيق.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="content-kind">نوع المحتوى</Label>
            <select
              id="content-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="content-id">معرّف المادة</Label>
            <Input
              id="content-id"
              value={contentId}
              onChange={(e) => setContentId(e.target.value)}
              placeholder="UUID"
            />
          </div>
        </div>
        <div className="mt-4">
          <AdminAction
            label="إزالة المحتوى"
            title="إزالة محتوى عام"
            impact="ستُخفى هذه المادة من كل الواجهات العامة فورًا."
            confirmLabel="إزالة"
            destructive
            onConfirm={async (reason) => {
              if (!contentId.trim()) return { ok: false, message: "أدخل معرّف المادة." };
              const res = await removeContent({ data: { kind, id: contentId.trim(), reason } });
              return { ok: res.ok, message: "message" in res ? res.message : undefined };
            }}
          />
        </div>
      </SectionCard>
    </div>
  );
}
