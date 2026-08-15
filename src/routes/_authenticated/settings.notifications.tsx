import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CardsSkeleton, ErrorState, HeroBadge, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { useT } from "@/i18n";
import {
  listNotificationPreferences,
  listNotificationTypes,
  setNotificationPreference,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationPreferencesPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "تفضيلات الإشعارات | ركيز" },
      {
        name: "description",
        content:
          "تحكّم في أنواع إشعارات ركيز الاختيارية. الأنواع الإلزامية والأمنية مفروضة في قاعدة البيانات ولا يمكن تعطيلها.",
      },
      { property: "og:title", content: "تفضيلات الإشعارات | ركيز" },
      {
        property: "og:description",
        content: "إيقاف الأنواع الاختيارية فقط، مع ضمان وصول التنبيهات الأمنية والإلزامية دائمًا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TYPE_LABEL_AR: Record<string, string> = {
  "request.submitted": "طلب جديد بانتظارك",
  "request.info_needed": "طلب استكمال معلومات",
  "request.decided": "قرار على طلبك",
  "stage.submitted": "تسليم مرحلة",
  "stage.rework": "إعادة مرحلة للتعديل",
  "stage.approved": "اعتماد مرحلة",
  "finance.disbursement_status": "تحديث طلب صرف",
  "finance.document_status": "تحديث مستند مالي",
  "security.membership_suspended": "تعليق عضوية",
  "document.shared": "مشاركة مستند",
  "contract.updated": "تحديث عقد",
};

function NotificationPreferencesPage() {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchTypes = useServerFn(listNotificationTypes);
  const fetchPrefs = useServerFn(listNotificationPreferences);
  const savePref = useServerFn(setNotificationPreference);

  const typesQuery = useQuery({
    queryKey: ["notifications", "types"],
    queryFn: () => fetchTypes(),
  });
  const { data: prefs = [] } = useQuery({
    queryKey: ["notifications", "prefs"],
    queryFn: () => fetchPrefs(),
  });

  const types = typesQuery.data ?? [];

  const save = useMutation({
    mutationFn: (vars: { typeCode: string; inApp: boolean }) =>
      savePref({
        data: {
          typeCode: vars.typeCode,
          inApp: vars.inApp,
          digestMode: vars.inApp ? "immediate" : "off",
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(t("notifications.saved"));
    },
    onError: () => toast.error(t("notifications.cannotDisable")),
  });

  const enabledFor = (code: string) =>
    prefs.find((p) => p.type_code === code)?.in_app ?? true;

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("notifications.preferences")}
        subtitle={t("notifications.prefsSubtitle")}
        badge={<HeroBadge tone="neutral">{types.length}</HeroBadge>}
      />

      <SectionCard icon={BellRing} title={t("notifications.preferences")} count={types.length}>
        {typesQuery.isLoading ? (
          <CardsSkeleton cards={2} />
        ) : types.length === 0 ? (
          <SoftEmpty icon={BellRing} message={t("notifications.empty")} />
        ) : (
          <ul className="space-y-3">
            {types.map((type) => {
              const locked = type.is_mandatory || type.is_security;
              return (
                <li
                  key={type.code}
                  className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{TYPE_LABEL_AR[type.code] ?? type.code}</p>
                    <p className="text-xs text-muted-foreground">{type.code}</p>
                  </div>
                  {type.is_security && <Badge variant="destructive">{t("notifications.security")}</Badge>}
                  {type.is_mandatory && !type.is_security && (
                    <Badge variant="secondary">{t("notifications.mandatory")}</Badge>
                  )}
                  <Switch
                    checked={locked ? true : enabledFor(type.code)}
                    disabled={locked || save.isPending}
                    aria-label={`${t("notifications.inApp")} — ${type.code}`}
                    onCheckedChange={(checked) =>
                      save.mutate({ typeCode: type.code, inApp: checked })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
