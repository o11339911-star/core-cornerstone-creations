import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookLock,
  Building2,
  ExternalLink,
  Inbox,
  LayoutGrid,
  ListChecks,
  LogOut,
  PlugZap,
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
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/lib/active-account";
import { queryClient } from "@/router";

/** أقسام لوحة مدير النظام — مصدر واحد للتنقل الإداري. */
export const PLATFORM_LINKS = [
  { to: "/platform/queue", label: "طابور المراجعة", icon: Inbox },
  { to: "/platform/requests", label: "الطلبات", icon: ListChecks },
  { to: "/platform/users", label: "المستخدمون", icon: UserSearch },
  { to: "/platform/entities", label: "الكيانات", icon: Building2 },
  { to: "/platform/studio", label: "الاستديو", icon: LayoutGrid },
  { to: "/platform/staff", label: "فريق المنصة", icon: Users },
  { to: "/platform/breakglass", label: "الوصول الطارئ", icon: ShieldAlert },
  { to: "/platform/integrations", label: "التكاملات", icon: PlugZap },
  { to: "/platform/dsr", label: "طلبات الخصوصية", icon: ShieldCheck },
  { to: "/platform/breach-playbook", label: "خطة الحوادث", icon: BookLock },
] as const;

/**
 * قشرة بيئة الإدارة: هيدر إداري مستقل بلا تنقل الحساب العام أو السوق.
 * الخروج إلى الواجهة العامة يتم بزر صريح واحد فقط.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { clearScope } = useActiveAccount();

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
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <Link to="/platform/queue" className="flex min-h-11 shrink-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              R
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-foreground">إدارة ركيز</span>
              <span className="text-[0.6875rem] text-muted-foreground">بيئة مدير النظام</span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
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

        <nav
          aria-label="أقسام إدارة المنصة"
          className="border-t border-border/60 bg-background"
        >
          <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
            {PLATFORM_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                  activeProps={{
                    className:
                      "bg-secondary text-primary inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
                  }}
                >
                  <link.icon className="size-4" aria-hidden="true" />
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
