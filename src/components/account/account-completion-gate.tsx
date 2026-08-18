import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Building2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toLatinDigits } from "@/lib/format";
import { ENTITY_TYPES } from "@/lib/entities.functions";
import { isValidSaudiId, linkPersonalIdentity } from "@/lib/identity.functions";
import {
  completeRegistrationEntity,
  getRegistrationState,
  REGISTRATION_LEGAL_FORMS,
} from "@/lib/registration.functions";

/**
 * Mandatory two-step completion gate: personal identity, then the commercial
 * entity with its unified national number. Nothing of the platform renders
 * until the server-derived state says the account is complete (or the caller
 * is platform staff, who bypass the gate). Fail closed on error.
 */

const REGISTRATION_QUERY_KEY = ["registration-state"] as const;

function digitsOnly(value: string, max: number): string {
  return toLatinDigits(value).replace(/[^0-9]/g, "").slice(0, max);
}

export function AccountCompletionGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const fetchState = useServerFn(getRegistrationState);

  const state = useQuery({
    queryKey: REGISTRATION_QUERY_KEY,
    queryFn: () => fetchState(),
    staleTime: 30_000,
    retry: false,
  });

  if (state.isPending) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-1/2 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (state.isError || !state.data) {
    return (
      <GateShell title={t("registration.errorTitle")} description={t("registration.errorBody")}>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => void state.refetch()}>
            {t("common.retry")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void supabase.auth.signOut().then(() => {
                window.location.assign("/auth");
              });
            }}
          >
            {t("registration.signOut")}
          </Button>
        </div>
      </GateShell>
    );
  }

  if (state.data.complete || state.data.bypass) return <>{children}</>;

  return <EmailVerifiedGuard><CompletionFlow step={state.data.current_step === "entity" ? "entity" : "identity"} /></EmailVerifiedGuard>;
}

function GateShell({
  title,
  description,
  progress,
  children,
}: {
  title: string;
  description: string;
  progress?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1.5 pb-4">
          {progress ? (
            <span className="text-xs font-medium text-primary">{progress}</span>
          ) : null}
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function CompletionFlow({ step }: { step: "identity" | "entity" }) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = React.useState<"identity" | "entity">(step);

  React.useEffect(() => {
    setCurrent(step);
  }, [step]);

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REGISTRATION_QUERY_KEY });
  }, [queryClient]);

  if (current === "identity") {
    return <IdentityStep onDone={() => { setCurrent("entity"); void refresh(); }} />;
  }
  return <EntityStep onDone={() => void refresh()} />;
}

function IdentityStep({ onDone }: { onDone: () => void }) {
  const t = useT();
  const link = useServerFn(linkPersonalIdentity);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (nationalId: string) => link({ data: { nationalId } }),
    onSuccess: () => {
      toast.success(t("registration.identitySaved"));
      onDone();
    },
    onError: (err: Error) => {
      setError(
        err.message === "IDENTITY_ALREADY_LINKED"
          ? t("registration.identityAlreadyLinked")
          : t("registration.identityInvalid"),
      );
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isValidSaudiId(value)) {
      setError(t("registration.identityInvalid"));
      return;
    }
    mutation.mutate(value);
  };

  return (
    <GateShell
      title={t("registration.identityTitle")}
      description={t("registration.identityHint")}
      progress={t("registration.stepOne")}
    >
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="reg-national-id" className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {t("registration.identityField")}
          </Label>
          <Input
            id="reg-national-id"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            className="h-11 text-start"
            value={value}
            onChange={(e) => setValue(digitsOnly(e.target.value, 10))}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("common.loading")}
            </span>
          ) : (
            t("registration.continue")
          )}
        </Button>
        <p className="text-xs text-muted-foreground">{t("registration.identityPrivacy")}</p>
      </form>
    </GateShell>
  );
}

function EntityStep({ onDone }: { onDone: () => void }) {
  const t = useT();
  const create = useServerFn(completeRegistrationEntity);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<(typeof ENTITY_TYPES)[number]>("developer");
  const [legalForm, setLegalForm] =
    React.useState<(typeof REGISTRATION_LEGAL_FORMS)[number]>("company");
  const [unn, setUnn] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      create({ data: { name: name.trim(), type, legalForm, unifiedNationalNumber: unn } }),
    onSuccess: () => {
      toast.success(t("registration.entitySaved"));
      onDone();
    },
    onError: (err: Error) => {
      setError(
        err.message === "OFFICIAL_ID_ALREADY_REGISTERED"
          ? t("registration.entityDuplicate")
          : err.message === "IDENTITY_REQUIRED"
            ? t("registration.identityRequired")
            : t("registration.entityFailed"),
      );
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError(t("registration.entityNameInvalid"));
      return;
    }
    if (!/^7[0-9]{9}$/.test(unn)) {
      setError(t("registration.unnInvalid"));
      return;
    }
    mutation.mutate();
  };

  return (
    <GateShell
      title={t("registration.entityTitle")}
      description={t("registration.entityHint")}
      progress={t("registration.stepTwo")}
    >
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="reg-entity-name" className="flex items-center gap-2 text-sm">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            {t("registration.entityName")}
          </Label>
          <Input
            id="reg-entity-name"
            className="h-11"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">{t("registration.entityType")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`entities.types.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("registration.legalForm")}</Label>
            <Select
              value={legalForm}
              onValueChange={(v) => setLegalForm(v as typeof legalForm)}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGISTRATION_LEGAL_FORMS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`entities.legalForms.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-unn" className="flex items-center gap-2 text-sm">
            <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
            {t("registration.unn")}
          </Label>
          <Input
            id="reg-unn"
            dir="ltr"
            inputMode="numeric"
            className="h-11 text-start"
            value={unn}
            onChange={(e) => setUnn(digitsOnly(e.target.value, 10))}
            aria-invalid={Boolean(error)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("common.loading")}
            </span>
          ) : (
            t("registration.finish")
          )}
        </Button>
      </form>
    </GateShell>
  );
}

/**
 * Hard stop: nothing of the registration flow renders until Supabase Auth
 * reports `email_confirmed_at`. The server function enforces the same rule.
 */
function EmailVerifiedGuard({ children }: { children: React.ReactNode }) {
  const t = useT();
  const verified = useQuery({
    queryKey: ["auth-email-confirmed"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return Boolean(data.user?.email_confirmed_at);
    },
    staleTime: 30_000,
    retry: false,
  });

  if (verified.isPending) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-1/2 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (verified.data === true) return <>{children}</>;

  return (
    <GateShell title={t("auth.emailNotVerifiedTitle")} description={t("auth.emailNotVerifiedBody")}>
      <ResendConfirmation />
      <Button
        variant="outline"
        className="min-h-11 w-full"
        onClick={() => void verified.refetch()}
      >
        {t("common.retry")}
      </Button>
    </GateShell>
  );
}
