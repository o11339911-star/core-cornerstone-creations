import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Building2,
  CalendarClock,
  FolderKanban,
  Handshake,
  Inbox,
  Mail,
  Phone,
  Store,
} from "lucide-react";

import { ErrorState, HeroBadge, PageHero } from "@/components/rakeez";
import { useT } from "@/i18n";
import { useAccountUi } from "@/lib/account-ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الرئيسية | ركيز" },
      {
        name: "description",
        content:
          "لوحة اختصارات ركيز: المشاريع والعقارات والتعاقد والمراسلات العامة والأرشيف وسوق الخدمات والاتصالات والمواعيد والطلبات.",
      },
      { property: "og:title", content: "الرئيسية | ركيز" },
      {
        property: "og:description",
        content: "افتح أي وحدة في ركيز من لوحة اختصارات واحدة مرتبة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Shortcut = {
  to: string;
  icon: typeof Store;
  label: string;
  description: string;
};

function DashboardPage() {
  const t = useT();
  const account = useAccountUi();

  const shortcuts: Shortcut[] = [
    {
      to: "/projects",
      icon: FolderKanban,
      label: "المشاريع",
      description: "كل مشاريع الحساب النشط وإنشاء مشروع جديد",
    },
    ...(account.isDeveloper
      ? [
          {
            to: "/properties",
            icon: Building2,
            label: "العقارات",
            description: "الصكوك والرخص والوحدات والحدود",
          } as Shortcut,
        ]
      : []),
    {
      to: "/deals",
      icon: Handshake,
      label: "التعاقد",
      description: "معاملات التعاقد مع الطرف الثاني وحالتها",
    },
    {
      to: "/correspondence",
      icon: Mail,
      label: "المراسلات العامة",
      description: "البريد وWhatsApp وطلبات عروض الأسعار والمراسلات المرتبطة",
    },
    {
      to: "/archive",
      icon: Archive,
      label: "الأرشيف",
      description: "مجلدات وملفات ومستندات الحساب النشط",
    },
    {
      to: "/marketplace",
      icon: Store,
      label: "سوق الخدمات",
      description: "الإعلانات والخدمات ومزوّدوها",
    },
    {
      to: "/calls",
      icon: Phone,
      label: "الاتصالات",
      description: "المكالمات الداخلية بين أطراف المشروع",
    },
    {
      to: "/appointments",
      icon: CalendarClock,
      label: "المواعيد",
      description: "الزيارات والاجتماعات بتوقيت الرياض",
    },
    {
      to: "/requests",
      icon: Inbox,
      label: "الطلبات",
      description: "الطلبات الواردة إليك والتي أنشأتها",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={t("common.dashboard")}
        subtitle="اختصارات ركيز — افتح الوحدة التي تحتاجها مباشرة."
        badge={
          <HeroBadge tone="neutral">{account.activeEntity?.name ?? "حساب شخصي"}</HeroBadge>
        }
      />

      <section aria-label={t("shell.quickActions")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((s) => (
            <li key={s.to}>
              <Link
                to={s.to}
                className="flex min-h-[5.5rem] items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 hover:border-primary/40 hover:shadow-elevated"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <s.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {s.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {s.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
