import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveModal, TextField, TextAreaField, normalizedInput } from "@/components/rakeez";
import { useT } from "@/i18n";
import { addDeedVersion } from "@/lib/properties.functions";

export type DeedHead = {
  id: string;
  deed_number: string | null;
  issuer: string | null;
} | null;

export function DeedVersionModal({
  propertyId,
  deed,
  trigger,
}: {
  propertyId: string;
  deed: DeedHead;
  trigger: React.ReactNode;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const submit = useServerFn(addDeedVersion);
  const [open, setOpen] = React.useState(false);

  const [deedNumber, setDeedNumber] = React.useState(deed?.deed_number ?? "");
  const [issuer, setIssuer] = React.useState(deed?.issuer ?? "");
  const [deedDate, setDeedDate] = React.useState("");
  const [area, setArea] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [errors, setErrors] = React.useState<{ deedNumber?: string }>({});

  React.useEffect(() => {
    if (open) {
      setDeedNumber(deed?.deed_number ?? "");
      setIssuer(deed?.issuer ?? "");
      setDeedDate("");
      setArea("");
      setOwnerName("");
      setErrors({});
    }
  }, [open, deed]);

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof addDeedVersion>[0]) => submit(input),
    onSuccess: () => {
      toast.success(t("properties.deeds.saved"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: { deedNumber?: string } = {};
    if (deedNumber.trim().length < 1) nextErrors.deedNumber = t("properties.deeds.numberRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    mutation.mutate({
      data: {
        propertyId,
        deedId: deed?.id ?? null,
        deedNumber: deedNumber.trim(),
        issuer: issuer.trim() || null,
        deedDate: deedDate || null,
        area: area ? Number(area) : null,
        ownerNameSnapshot: ownerName.trim() || null,
      },
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={deed ? t("properties.deeds.addVersion") : t("properties.deeds.addDeed")}
      description={t("properties.documents.versionHint")}
    >
      <form onSubmit={onSubmit} className="space-y-4 py-2" noValidate>
        <TextField
          id="deed-number"
          label={t("properties.deeds.number")}
          error={errors.deedNumber}
          required
          {...normalizedInput(deedNumber, setDeedNumber)}
        />
        <TextField
          id="deed-issuer"
          label={t("properties.deeds.issuer")}
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
        />
        <TextField
          id="deed-date"
          label={t("properties.deeds.date")}
          type="date"
          value={deedDate}
          onChange={(e) => setDeedDate(e.target.value)}
        />
        <TextField
          id="deed-area"
          label={t("properties.landArea")}
          type="number"
          {...normalizedInput(area, setArea)}
        />
        <TextField
          id="deed-owner"
          label={t("properties.deeds.ownerSnapshot")}
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
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
