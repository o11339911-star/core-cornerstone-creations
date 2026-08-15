import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeRedirect } from "@/lib/safe-redirect";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type SignInForm = z.infer<typeof signInSchema>;

export const Route = createFileRoute("/auth")({
  // Auth pages depend on the browser-only Supabase session; skip SSR to avoid
  // hydration mismatches between the server shell and the client render.
  ssr: false,
  component: SignInPage,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

function SignInPage() {
  const t = useT();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirect = sanitizeRedirect(search.redirect);

  const form = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SignInForm) => {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);

    if (signInError) {
      setError(t("auth.invalidCredentials"));
      return;
    }

    navigate({ to: redirect, replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("auth.signInTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                {...form.register("email")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                {...form.register("password")}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("common.loading") : t("auth.signIn")}
            </Button>
          </form>

          <div className="flex items-center justify-between text-sm">
            <Link to="/auth/forgot-password" className="text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
            <span className="text-muted-foreground">{t("auth.noPublicSignup")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
