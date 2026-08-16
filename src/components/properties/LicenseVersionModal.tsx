import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveModal, TextField, normalizedInput } from "@/components/rakeez";
import { useT } from "@/i18n";
import { addLicenseVersion } from "@/lib/properties.functions";

export type LicenseHead = {
  id: string;
  license_number: string | null;
  authority: string | null;
} | null;

export function LicenseVersionModal({
  propertyId,
  license,
  trigger,
}: {
  propertyId: string;
  license: LicenseHead;
  trigger: React.ReactNode;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const submit = useServerFn(addLicenseVersion);
  const [open, setOpen] = React.useState(false);

  const [licenseNumber, setLicenseNumber] = React.useState(license?.license_number ?? "");
  const [authority, setAuthority] = React.useState(license?.authority ?? "");
  const [issuedOn, setIssuedOn] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [scopeText, setScopeText] = React.useState("");
  const [errors, setErrors] = React.useState<{ licenseNumber?: string }>({});

  React.useEffect(() => {
    if (open) {
      setLicenseNumber(license?.license_number ?? "");
      setAuthority(license?.authority ?? "");
      setIssuedOn("");
      setExpiresOn("");
      setScopeText("");
      setErrors({});
    }
  }, [open, license]);

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof addLicenseVersion>[0]) => submit(input),
    onSuccess: () => {
      toast.success(t("properties.licenses.saved"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: { licenseNumber?: string } = {};
    if (licenseNumber.trim().length < 1)
      nextErrors.licenseNumber = t("properties.licenses.numberRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    mutation.mutate({
      data: {
        propertyId,
        licenseId: license?.id ?? null,
        licenseNumber: licenseNumber.trim(),
        authority: authority.trim() || null,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        scopeText: scopeText.trim() || null,
      },
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={license ? t("properties.licenses.addVersion") : t("properties.licenses.addLicense")}
      description={t("properties.documents.versionHint")}
    >
      <form onSubmit={onSubmit} className="space-y-4 py-2" noValidate>
        <TextField
          id="license-number"
          label={t("properties.licenses.number")}
          error={errors.licenseNumber}
          required
          {...normalizedInput(licenseNumber, setLicenseNumber)}
        />
        <TextField
          id="license-authority"
          label={t("properties.licenses.authority")}
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
        />
        <TextField
          id="license-issued"
          label={t("properties.licenses.issuedOn")}
          type="date"
          value={issuedOn}
          onChange={(e) => setIssuedOn(e.target.value)}
        />
        <TextField
          id="license-expires"
          label={t("properties.licenses.expiresOn")}
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
        />
        <TextField
          id="license-scope"
          label={t("properties.licenses.scope")}
          value={scopeText}
          onChange={(e) => setScopeText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("properties.documents.versionHint")}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
            {mutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
