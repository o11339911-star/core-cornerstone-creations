import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { sanitizeRedirect } from "@/lib/safe-redirect";
import { toLatinDigits } from "@/lib/format";
import { isValidSaudiId, normalizeNationalId } from "@/lib/identity-format";
import { signInWithIdentifierFn, signUpWithIdentityFn } from "@/lib/auth-identity.functions";
import { setSessionPersist } from "@/integrations/supabase/session-storage";
import { NafathButton } from "@/components/auth/nafath-button";

const signInSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3)
    .max(160)
    // Single field: a valid e-mail OR a valid Saudi national ID / iqama.
    .refine((v) =>
      v.includes("@")
        ? z.string().email().safeParse(v).success
        : isValidSaudiId(normalizeNationalId(v)),
    ),
  password: z.string().min(8),
});

type SignInForm = z.infer<typeof signInSchema>;

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    nationalId: z
      .string()
      .trim()
      .min(1)
      .refine((v) => isValidSaudiId(normalizeNationalId(v)), { message: "nationalId" }),
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
                  mode === m
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-primary"
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
  const [rememberSession, setRememberSession] = useState(true);

  const redirect = sanitizeRedirect(search.redirect);

  const form = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values: SignInForm) => {
    setError(null);
    setSubmitting(true);

    // The identifier is resolved on the server; the browser never learns the
    // account e-mail behind a national ID, and every failure looks identical.
    const identifier = values.identifier.includes("@")
      ? values.identifier.trim()
      : normalizeNationalId(values.identifier);

    let result: Awaited<ReturnType<typeof signInWithIdentifierFn>>;
    try {
      result = await signInWithIdentifierFn({ data: { identifier, password: values.password } });
    } catch {
      setSubmitting(false);
      setError(t("auth.invalidCredentials"));
      return;
    }

    if (!result.ok) {
      setSubmitting(false);
      setError(
        result.reason === "throttled" ? t("auth.tooManyAttempts") : t("auth.invalidCredentials"),
      );
      return;
    }

    // يجب ضبط خيار الحفظ قبل كتابة الجلسة حتى تُكتب في المخزن الصحيح.
    setSessionPersist(rememberSession);

    const { error: sessionError } = await supabase.auth.setSession(result.session);
    if (sessionError) {
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
          <Label htmlFor="identifier">{t("auth.identifier")}</Label>
          <Input
            id="identifier"
            type="text"
            inputMode="text"
            autoComplete="username"
            dir="ltr"
            className="h-11"
            aria-describedby="identifier-hint"
            aria-invalid={Boolean(form.formState.errors.identifier)}
            {...form.register("identifier")}
          />
          <p id="identifier-hint" className="text-xs text-muted-foreground">
            {t("auth.identifierHint")}
          </p>
          {form.formState.errors.identifier ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("auth.identifierInvalid")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("auth.passwordTooShort")}
            </p>
          ) : null}
        </div>

        <label
          htmlFor="remember-session"
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3"
        >
          <input
            id="remember-session"
            type="checkbox"
            checked={rememberSession}
            onChange={(e) => setRememberSession(e.target.checked)}
            className="mt-1 size-5 accent-[var(--color-primary,currentColor)] text-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">حفظ الجلسة</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              ابقَ مسجلًا على هذا الجهاز. لا تفعّله على جهاز مشترك.
            </span>
          </span>
        </label>

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

      <NafathButton />

      <div className="text-sm">
        <Link
          to="/auth/forgot-password"
          className="inline-block min-h-11 py-2 text-primary hover:underline"
        >
          {t("auth.forgotPassword")}
        </Link>
        <span className="px-2 text-muted-foreground" aria-hidden="true">
          ·
        </span>
        <Link to="/verify-file" className="inline-block min-h-11 py-2 text-primary hover:underline">
          تحقق من ملف
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
    defaultValues: {
      fullName: "",
      email: "",
      nationalId: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: SignUpForm) => {
    setError(null);
    setSubmitting(true);

    const phone = values.phone ? toLatinDigits(values.phone).replace(/\s+/g, "") : "";

    // The account and the identity link are created in one server call; the
    // raw identity number never touches storage, the URL or any log.
    let result: Awaited<ReturnType<typeof signUpWithIdentityFn>>;
    try {
      result = await signUpWithIdentityFn({
        data: {
          email: values.email,
          password: values.password,
          fullName: values.fullName,
          phone: phone || null,
          nationalId: normalizeNationalId(values.nationalId),
        },
      });
    } catch {
      setSubmitting(false);
      setError(t("auth.signUpFailed"));
      return;
    }

    if (!result.ok) {
      setSubmitting(false);
      if (result.reason === "identity_taken") setError(t("auth.identityUnavailable"));
      else if (result.reason === "invalid_id") setError(t("auth.nationalIdInvalid"));
      else if (result.reason === "throttled") setError(t("auth.tooManyAttempts"));
      else setError(t("auth.signUpFailed"));
      return;
    }

    if (!result.needsConfirmation) {
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
        <Label htmlFor="signup-national-id">{t("auth.nationalId")}</Label>
        <Input
          id="signup-national-id"
          type="text"
          inputMode="numeric"
          maxLength={10}
          dir="ltr"
          className="h-11"
          autoComplete="off"
          aria-describedby="national-id-hint"
          aria-invalid={Boolean(form.formState.errors.nationalId)}
          {...form.register("nationalId")}
        />
        <p id="national-id-hint" className="text-xs text-muted-foreground">
          {t("auth.nationalIdHint")}
        </p>
        {form.formState.errors.nationalId ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {t("auth.nationalIdInvalid")}
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
        <PasswordInput
          id="signup-password"
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
        <PasswordInput
          id="confirm-password"
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
