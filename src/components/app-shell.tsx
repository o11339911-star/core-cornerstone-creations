import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarClock,
  Home,
  LogOut,
  Repeat,
  ShieldCheck,
  Store,
  User,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { LanguageToggle } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAccountUi } from "@/lib/account-ui";
import { useActiveAccount } from "@/lib/active-account";
import { queryClient } from "@/router";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Home;
};

const BASE_NAV: NavItem[] = [
  { to: "/dashboard", labelKey: "shell.home", icon: Home },
  { to: "/marketplace", labelKey: "shell.marketplace", icon: Store },
  { to: "/appointments", labelKey: "shell.appointments", icon: CalendarClock },
  { to: "/profile", labelKey: "shell.profile", icon: User },
];

export function entityTypeLabel(t: (key: string) => string, type: string | null | undefined) {
  if (!type) return t("shell.personal");
  const known = [
    "developer",
    "contractor",
    "company",
    "design_office",
    "inspector",
    "supervision",
  ];
  return known.includes(type) ? t(`shell.entityTypes.${type}`) : t("shell.entityTypes.other");
}

export function AuthenticatedAppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { loading, activeEntity, isDeveloper } = useAccountUi();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Desktop nav only reveals modules the verified account may use.
  const desktopNav: NavItem[] = [
    ...BASE_NAV.slice(0, 3),
    ...(isDeveloper
      ? [{ to: "/properties", labelKey: "shell.properties", icon: Building2 } as NavItem]
      : []),
  ];

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          <Link to="/dashboard" className="flex min-h-11 shrink-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {t("common.appInitial")}
            </span>
            <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              {t("common.appName")}
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label={t("shell.mainMenu")}
          >
            {desktopNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/select-account"
              className="hidden max-w-[12rem] items-center gap-2 truncate rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              title={t("shell.switchAccount")}
            >
              <Repeat className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {loading
                  ? t("shell.loadingAccount")
                  : (activeEntity?.name ?? t("shell.personal"))}
              </span>
            </Link>
            <LanguageToggle />
            <NotificationsBell />
            <AccountMenu />
          </div>
        </div>
        <Link
          to="/select-account"
          className="flex w-full items-center gap-2 border-t border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground sm:hidden"
        >
          <Repeat className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {loading ? t("shell.loadingAccount") : (activeEntity?.name ?? t("shell.personal"))}
          </span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] text-primary">
            {entityTypeLabel(t, activeEntity?.type)}
          </span>
        </Link>
        {!online && (
          <p
            role="status"
            className="bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning"
          >
            {t("shell.offline")}
          </p>
        )}
      </header>

      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      <nav
        aria-label={t("shell.mainMenu")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-md items-stretch">
          {BASE_NAV.map((item) => {
            const active = isActive(item.to);
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function AccountMenu() {
  const t = useT();
  const navigate = useNavigate();
  const { clearScope } = useActiveAccount();
  const { activeEntity, loading } = useAccountUi();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearScope();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("shell.accountMenu")}
        className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <User className="size-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {loading ? t("shell.loadingAccount") : (activeEntity?.name ?? t("shell.personal"))}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center gap-2">
            <User className="size-4" aria-hidden="true" />
            {t("shell.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/select-account" className="flex items-center gap-2">
            <Repeat className="size-4" aria-hidden="true" />
            {t("shell.switchAccount")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/security" className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("common.security")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/notifications" className="flex items-center gap-2">
            <CalendarClock className="size-4" aria-hidden="true" />
            {t("shell.notifications")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()} className="flex items-center gap-2">
          <LogOut className="size-4" aria-hidden="true" />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
