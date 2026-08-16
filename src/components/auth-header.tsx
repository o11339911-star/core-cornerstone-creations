import * as React from "react";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Menu, X } from "lucide-react";

import { AccountMenu } from "@/components/app-shell";
import { LanguageToggle } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

type SessionState = "unknown" | "guest" | "authenticated";

const NAV_LINKS: { key: string; to: string }[] = [
  { key: "nav.home", to: "/" },
  { key: "nav.services", to: "/#services" },
  { key: "nav.about", to: "/#about" },
  { key: "nav.contact", to: "/#contact" },
];

/**
 * Public site header. The sign-in affordance is ALWAYS rendered: while the
 * session is still resolving we keep the sign-in button in place (safe default
 * for a visitor) instead of leaving an empty slot that shifts the layout.
 */
export function AuthHeader() {
  const t = useT();
  const [session, setSession] = React.useState<SessionState>("unknown");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setSession(data.user ? "authenticated" : "guest");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next?.user ? "authenticated" : "guest");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Focus trap + Escape handling for the mobile menu.
  React.useEffect(() => {
    if (!menuOpen) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const isAuthenticated = session === "authenticated";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {t("common.appInitial")}
          </span>
          <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            {t("common.appName")}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label={t("shell.mainMenu")}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageToggle />
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                aria-label={t("common.dashboard")}
                className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 sm:size-auto sm:min-h-11 sm:px-4 sm:py-2"
              >
                <LayoutDashboard className="size-5 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">{t("common.dashboard")}</span>
              </Link>
              <AccountMenu />
            </>
          ) : (
            <Link
              to="/auth"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
            >
              {t("auth.signIn")}
            </Link>
          )}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="public-mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("shell.mainMenu")}
          className="border-t border-border bg-background px-4 pb-4 md:hidden"
        >
          <nav className="flex flex-col" aria-label={t("shell.mainMenu")}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="inline-flex min-h-11 items-center border-b border-border/60 py-3 text-sm font-medium text-foreground last:border-0"
              >
                {t(link.key)}
              </Link>
            ))}
            <Link
              to={isAuthenticated ? "/dashboard" : "/auth"}
              onClick={() => setMenuOpen(false)}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {isAuthenticated ? t("common.dashboard") : t("auth.signIn")}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
