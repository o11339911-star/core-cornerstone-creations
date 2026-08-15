import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, PageHero, SectionCard, SoftEmpty, CardsSkeleton } from "@/components/rakeez";
import { ShieldCheck, ShieldPlus } from "lucide-react";
import { listWarranties, registerWarranty } from "@/lib/warranties.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/warranties")({
  component: WarrantiesPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الضمانات | ركيز" },
      {
        name: "description",
        content:
          "سجل ضمانات المشروع بمزوّديها وأنواعها ومددها، مع تنبيهات قبل انتهاء الضمان بـ 90 و30 و7 أيام.",
      },
      { property: "og:title", content: "الضمانات | ركيز" },
      {
        property: "og:description",
        content: "متابعة ضمانات الأنظمة والمكوّنات وتنبيهات قرب انتهائها بتوقيت الرياض.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TYPE_AR: Record<string, string> = {
  workmanship: "ضمان تنفيذ",
  material: "ضمان مواد",
  equipment: "ضمان معدات",
  structural: "ضمان إنشائي",
};
const STATUS_AR: Record<string, string> = {
  active: "ساري",
  expired: "منتهٍ",
  void: "ملغى",
};

function daysLeft(endsOn: string) {
  const diff = new Date(`${endsOn}T23:59:59+03:00`).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function WarrantiesPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fetchWarranties = useServerFn(listWarranties);
  const create = useServerFn(registerWarranty);

  const warranties = useQuery({
    queryKey: ["warranties", projectId],
    queryFn: () => fetchWarranties({ data: { projectId } }),
  });

  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const register = useMutation({
    mutationFn: create,
    onSuccess: () => {
      toast.success("تم تسجيل الضمان وبدء عدّاد التنبيه");
      setTitle("");
      setStartsOn("");
      setEndsOn("");
      void qc.invalidateQueries({ queryKey: ["warranties", projectId] });
      void qc.invalidateQueries({ queryKey: ["timers", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title="الضمانات"
        subtitle="كل ضمان يُنشئ عدّاد مدة في المحرك نفسه المستخدم للمدد والتصعيد، ويُنبّه المسؤولين قبل الانتهاء بـ 90 و30 و7 أيام ثم عند الانتهاء."
      />

      <SectionCard icon={ShieldPlus} title="تسجيل ضمان">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="وصف الضمان (مثال: ضمان أعمال التكييف)"
          />
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <Button
          disabled={title.trim().length < 3 || !startsOn || !endsOn}
          onClick={() =>
            register.mutate({
              data: {
                projectId,
                title: title.trim(),
                warrantyType: "workmanship",
                startsOn,
                endsOn,
                scopeKind: "system",
                systemCode: null,
                providerKind: "contractor",
                providerName: null,
                documentId: null,
              },
            })
          }
        >
          تسجيل الضمان
        </Button>
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="الضمانات المسجلة" count={warranties.data?.length ?? 0}>
        {warranties.isLoading ? (
          <CardsSkeleton cards={1} />
        ) : warranties.data && warranties.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {warranties.data.map((w) => {
              const left = daysLeft(w.ends_on);
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{w.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_AR[w.warranty_type] ?? w.warranty_type} · من {w.starts_on} إلى{" "}
                      {w.ends_on}
                      {w.provider_name ? ` · المزوّد: ${w.provider_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {left <= 90 && left > 0 ? (
                      <Badge variant="secondary">متبقٍ {left} يومًا</Badge>
                    ) : null}
                    {left <= 0 ? <Badge variant="destructive">انتهى</Badge> : null}
                    <Badge variant={w.status === "active" ? "default" : "secondary"}>
                      {STATUS_AR[w.status] ?? w.status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <SoftEmpty icon={ShieldCheck} message="لا توجد ضمانات مسجلة لهذا المشروع." />
        )}
      </SectionCard>
    </main>
  );
}
