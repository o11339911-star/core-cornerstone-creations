import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { LanguageToggle } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount, type AccountScope } from "@/lib/active-account";
import { queryClient } from "@/router";

type User = {
  id: string;
  email: string | undefined;
};

export function AuthHeader() {
  const t = useT();
  const navigate = useNavigate();
  const { scope, clearScope } = useActiveAccount();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted) setUser(data.user ? { id: data.user.id, email: data.user.email } : null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearScope();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const navLinks = [
    { key: "nav.home", to: "/" },
    { key: "nav.services", to: "/#services" },
    { key: "nav.about", to: "/#about" },
    { key: "nav.contact", to: "/#contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {t("common.appInitial")}
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">{t("common.appName")}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label={t("nav.home")}>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageToggle />
          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-2">
                  {scope && <ActiveScopeBadge scope={scope} />}
                  <NotificationsBell />
                  <Link
                    to="/settings/security"
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("common.settings")}
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    {t("auth.signOut")}
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  {t("auth.signIn")}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ActiveScopeBadge({ scope }: { scope: AccountScope }) {
  const t = useT();
  const label = scope.kind === "personal" ? t("account.personal") : t("account.entities");
  return (
    <span className="hidden max-w-[10rem] truncate rounded-full border border-rakeez-gold/30 bg-rakeez-gold/10 px-3 py-1 text-xs font-medium text-rakeez-gold sm:inline-block">
      {label}
    </span>
  );
}
