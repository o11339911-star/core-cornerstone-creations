import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Building2, PencilLine, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "@/components/rakeez";
import { Num } from "@/components/rakeez/numeric";
import { useT } from "@/i18n";
import {
  listOwnerOptions,
  setPropertyPrimaryOwner,
  type PropertyProfile,
} from "@/lib/properties.functions";

type Owner = PropertyProfile["owners"][number];

/**
 * Read-only ownership card: the owner is always derived server-side from the
 * active account, never typed by hand. Authorized users may only *correct* it
 * by picking one of their own accounts, with a mandatory reason.
 */
export function OwnershipPanel({
  propertyId,
  owners,
  canManage,
  needsFix,
}: {
  propertyId: string;
  owners: Owner[];
  canManage: boolean;
  needsFix: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);

  const fetchOptions = useServerFn(listOwnerOptions);
  const submit = useServerFn(setPropertyPrimaryOwner);

  const optionsQuery = useQuery({
    queryKey: ["owner-options"],
    queryFn: () => fetchOptions(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof setPropertyPrimaryOwner>[0]) => submit(input),
    onSuccess: () => {
      toast.success(t("properties.owners.updated"));
      setOpen(false);
      setReason("");
      setChoice("");
      void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message.includes("FORBIDDEN")
          ? t("properties.owners.forbidden")
          : t("properties.owners.updateFailed"),
      ),
  });

  const current = owners.filter((o) => !o.ends_on).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  const history = owners.filter((o) => o.ends_on);

  const editButton = canManage ? (
    <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
      <PencilLine className="me-2 size-4" aria-hidden="true" />
      {t("properties.owners.edit")}
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {current ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                {current.owner_source === "entity" ? (
                  <Building2 className="size-5" aria-hidden="true" />
                ) : (
                  <UserRound className="size-5" aria-hidden="true" />
                )}
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{current.owner_name_text ?? "—"}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    {current.owner_source === "entity"
                      ? t("properties.owners.sourceEntity")
                      : t("properties.owners.sourcePersonal")}
                  </Badge>
                  <Badge variant={current.owner_verification_status === "verified" ? "default" : "outline"}>
                    {t(`properties.owners.verify.${current.owner_verification_status ?? "pending"}` as never)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t("properties.owners.share")}: <Num>{`${current.share_percent}%`}</Num>
                  </span>
                </div>
                {current.owner_source === "entity" && current.owner_unified_number ? (
                  <p className="text-xs text-muted-foreground">
                    {t("properties.owners.unifiedNumber")}: <Num>{current.owner_unified_number}</Num>
                  </p>
                ) : null}
              </div>
            </div>
            {editButton}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {t("properties.owners.needsFix")}
            </p>
            {editButton}
          </div>
        </div>
      )}

      {needsFix && current ? null : null}

      {history.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("properties.owners.history")}</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2">
                <span className="text-foreground">{row.owner_name_text ?? "—"}</span>
                <Num>{`${row.starts_on} → ${row.ends_on}`}</Num>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("properties.owners.derivedHint")}</p>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={t("properties.owners.edit")}
        description={t("properties.owners.editHint")}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim().length < 5) {
              setReasonError(t("properties.owners.reasonRequired"));
              return;
            }
            setReasonError(null);
            const option = (optionsQuery.data ?? []).find((o) => o.value === choice);
            if (!option) return;
            mutation.mutate({
              data: { propertyId, entityId: option.entityId, reason: reason.trim() },
            });
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="owner-choice">{t("properties.owners.newOwner")}</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id="owner-choice" className="min-h-11">
                <SelectValue placeholder={t("properties.owners.newOwner")} />
              </SelectTrigger>
              <SelectContent>
                {(optionsQuery.data ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label || t("properties.owners.sourcePersonal")}
                    {option.kind === "personal" ? ` — ${t("properties.owners.sourcePersonal")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner-reason">{t("properties.owners.reason")}</Label>
            <Textarea
              id="owner-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(reasonError)}
            />
            {reasonError ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {reasonError}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="min-h-11" disabled={mutation.isPending || !choice}>
              {mutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
}
