import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlarmClock,
  ArrowUpRight,
  BookLock,
  Building2,
  ExternalLink,
  FileText,
  Flag,
  Gauge,
  Inbox,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  PlugZap,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserSearch,
  Users,
} from "lucide-react";

import { LanguageToggle } from "@/components/rakeez";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/lib/active-account";
import { getPlatformBadges } from "@/lib/platform-console.functions";
import { formatCount } from "@/lib/format";
import { queryClient } from "@/router";

type BadgeKey = "queueOpen" | "dsrOpen" | "incidentsOpen" | "timersOverdue";

type PlatformLink = {
  to: string;
  label: string;
  icon: typeof Inbox;
  badge?: BadgeKey;
};

/** أقسام إدارة المنصة مجمّعة حسب المهمة — مصدر واحد للتنقل الإداري. */
export const PLATFORM_GROUPS: { title: string; links: PlatformLink[] }[] = [
  {
    title: "نظرة عامة",
    links: [{ to: "/platform", label: "لوحة القيادة", icon: Gauge }],
  },
  {
    title: "التشغيل",
    links: [
      { to: "/platform/queue", label: "طابور المراجعة", icon: Inbox, badge: "queueOpen" },
      { to: "/platform/requests", label: "الطلبات", icon: ListChecks },
      { to: "/platform/sla", label: "مؤقتات الالتزام", icon: AlarmClock, badge: "timersOverdue" },
    ],
  },
  {
    title: "الجهات",
    links: [
      { to: "/platform/entities", label: "الكيانات", icon: Building2 },
      { to: "/platform/users", label: "المستخدمون", icon: UserSearch },
      { to: "/platform/staff", label: "فريق المنصة", icon: Users },
      { to: "/platform/content", label: "المشاريع والمحتوى", icon: FolderKanban },
    ],
  },

  {
    title: "الامتثال",
    links: [
      { to: "/platform/dsr", label: "طلبات الخصوصية", icon: ShieldCheck, badge: "dsrOpen" },
      { to: "/platform/privacy", label: "سجل المعالجة", icon: ScrollText },
      { to: "/platform/legal", label: "الوثائق القانونية", icon: FileText },
      { to: "/platform/incidents", label: "حوادث البيانات", icon: ShieldAlert, badge: "incidentsOpen" },
      { to: "/platform/breach-playbook", label: "خطة الحوادث", icon: BookLock },
    ],
  },
  {
    title: "المنصة",
    links: [
      { to: "/platform/integrations", label: "التكاملات", icon: PlugZap },
      { to: "/platform/flags", label: "الأعلام والباقات", icon: Flag },
      { to: "/platform/escalations", label: "سياسات التصعيد", icon: ArrowUpRight },
      { to: "/platform/breakglass", label: "الوصول الطارئ", icon: ShieldAlert },
      { to: "/platform/audit", label: "سجل التدقيق", icon: ScrollText },
      { to: "/platform/studio", label: "الاستديو", icon: LayoutGrid },
      { to: "/platform/report-templates", label: "قوالب التقارير", icon: FileText },
    ],
  },
];

/** روابط مسطّحة للاستهلاك خارج القشرة. */
export const PLATFORM_LINKS = PLATFORM_GROUPS.flatMap((group) => group.links);

function NavList({
  badges,
  onNavigate,
}: {
  badges: Partial<Record<BadgeKey, number>>;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="أقسام إدارة المنصة" className="space-y-4">
      {PLATFORM_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold text-muted-foreground">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const count = link.badge ? (badges[link.badge] ?? 0) : 0;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={onNavigate}
                    activeOptions={{ exact: link.to === "/platform" }}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                    activeProps={{
                      className:
                        "bg-secondary text-primary flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold",
                    }}
                  >
                    <link.icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {count > 0 ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">
                        {formatCount(count)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * قشرة بيئة الإدارة: هيدر إداري مستقل + شريط جانبي ثابت على الشاشات الكبيرة
 * وقائمة منسدلة على الجوال. الخروج إلى الواجهة العامة بزر صريح واحد.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { clearScope } = useActiveAccount();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchBadges = useServerFn(getPlatformBadges);
  const badges = useQuery({
    queryKey: ["platform-badges"],
    queryFn: () => fetchBadges(),
    refetchInterval: 60_000,
  });
  const counts = badges.data ?? {};

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearScope();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger
                aria-label="أقسام الإدارة"
                className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground lg:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72 overflow-y-auto p-4">
                <SheetTitle className="mb-3 text-base">أقسام الإدارة</SheetTitle>
                <NavList badges={counts} onNavigate={() => setDrawerOpen(false)} />
              </SheetContent>
            </Sheet>

            <Link to="/platform" className="flex min-h-11 min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                R
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-base font-bold tracking-tight text-foreground">
                  إدارة ركيز
                </span>
                <span className="truncate text-[0.6875rem] text-muted-foreground">
                  مركز قيادة المنصة
                </span>
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/dashboard"
              className="hidden min-h-11 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              الانتقال إلى الموقع العام
            </Link>
            <LanguageToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="قائمة مدير النظام"
                className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>مدير النظام</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="flex items-center gap-2 sm:hidden">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    الموقع العام
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings/security" className="flex items-center gap-2">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    أمان الحساب
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="flex items-center gap-2">
                  <LogOut className="size-4" aria-hidden="true" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20">
            <NavList badges={counts} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
