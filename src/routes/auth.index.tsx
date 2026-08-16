import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { authCallbackUrl } from "@/lib/auth-origin";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { sanitizeRedirect } from "@/lib/safe-redirect";
import { toLatinDigits } from "@/lib/format";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type SignInForm = z.infer<typeof signInSchema>;

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^[0-9+][0-9]{7,15}$/.test(v), { message: "phone" }),
    password: z.string().min(8).max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

type SignUpForm = z.infer<typeof signUpSchema>;

export const Route = createFileRoute("/auth/")({
  // Auth pages depend on the browser-only Supabase session; skip SSR to avoid
  // hydration mismatches between the server shell and the client render.
  component: AuthPage,
});

function AuthPage() {
  const t = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-card">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {mode === "signin" ? t("auth.signInTitle") : t("auth.signUpTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin" ? t("auth.signInSubtitle") : t("auth.signUpSubtitle")}
            </p>
          </div>

          <div
            role="tablist"
            aria-label={t("auth.signInTitle")}
            className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                  mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary"
                }`}
              >
                {m === "signin" ? t("auth.signIn") : t("auth.signUp")}
              </button>
            ))}
          </div>

          {mode === "signin" ? <SignInForm /> : <SignUpFormView />}

          <p className="text-center text-xs text-muted-foreground">{t("auth.completionNote")}</p>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
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

    if (signInError) {
      setSubmitting(false);
      setError(t("auth.invalidCredentials"));
      return;
    }

    navigate({ to: redirect, replace: true });
  };

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            className="h-11"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("auth.invalidEmail")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            className="h-11"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("auth.passwordTooShort")}
            </p>
          ) : null}
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("common.loading")}
            </span>
          ) : (
            t("auth.signIn")
          )}
        </Button>
      </form>

      <div className="text-sm">
        <Link to="/auth/forgot-password" className="inline-block min-h-11 py-2 text-primary hover:underline">
          {t("auth.forgotPassword")}
        </Link>
      </div>
    </>
  );
}

function SignUpFormView() {
  const t = useT();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const form = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", phone: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SignUpForm) => {
    setError(null);
    setSubmitting(true);

    const phone = values.phone ? toLatinDigits(values.phone).replace(/\s+/g, "") : "";

    // `full_name` feeds the existing profiles trigger. No role or membership is
    // ever derived from user metadata.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        data: { full_name: values.fullName, ...(phone ? { phone } : {}) },
      },
    });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message.toLowerCase().includes("registered") ? t("auth.emailTaken") : t("auth.signUpFailed"));
      return;
    }

    if (data.session) {
      if (phone) {
        await supabase.from("profiles").update({ phone }).eq("id", data.session.user.id);
      }
      navigate({ to: "/dashboard", replace: true });
      return;
    }

    setSubmitting(false);
    setCheckEmail(true);
  };

  if (checkEmail) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4 text-center">
        <MailCheck className="mx-auto size-6 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{t("auth.checkEmailTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("auth.checkEmailBody")}</p>
        <ResendConfirmation email={form.getValues("email")} />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">{t("auth.fullName")}</Label>
        <Input
          id="fullName"
          className="h-11"
          autoComplete="name"
          aria-invalid={Boolean(form.formState.errors.fullName)}
          {...form.register("fullName")}
        />
        {form.formState.errors.fullName ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.fullNameInvalid")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">{t("auth.email")}</Label>
        <Input
          id="signup-email"
          type="email"
          dir="ltr"
          className="h-11"
          autoComplete="email"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.invalidEmail")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phoneOptional")}</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          className="h-11"
          autoComplete="tel"
          aria-invalid={Boolean(form.formState.errors.phone)}
          {...form.register("phone")}
        />
        {form.formState.errors.phone ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.phoneInvalid")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">{t("auth.password")}</Label>
        <Input
          id="signup-password"
          type="password"
          dir="ltr"
          className="h-11"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.passwordTooShort")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
        <Input
          id="confirm-password"
          type="password"
          dir="ltr"
          className="h-11"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.confirmPassword)}
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.passwordMismatch")}
          </p>
        ) : null}
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
        {submitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("common.loading")}
          </span>
        ) : (
          t("auth.createAccount")
        )}
      </Button>
    </form>
  );
}
