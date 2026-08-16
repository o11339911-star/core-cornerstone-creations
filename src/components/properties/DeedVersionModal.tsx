import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal, TextField, normalizedInput } from "@/components/rakeez";
import { useT } from "@/i18n";
import { useActiveAccount } from "@/lib/active-account";
import { addDeedVersion } from "@/lib/properties.functions";
import {
  createDocument,
  linkDocument,
  reserveDocumentVersion,
} from "@/lib/documents.functions";
import { abortUpload } from "@/lib/analysis.functions";

export type DeedHead = {
  id: string;
  deed_number: string | null;
  issuer: string | null;
} | null;

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { scope } = useActiveAccount();
  const entityId = scope?.kind === "entity" ? scope.entityId : null;

  const submit = useServerFn(addDeedVersion);
  const createDoc = useServerFn(createDocument);
  const reserveVersion = useServerFn(reserveDocumentVersion);
  const link = useServerFn(linkDocument);
  const abort = useServerFn(abortUpload);

  const [open, setOpen] = React.useState(false);

  const [deedNumber, setDeedNumber] = React.useState(deed?.deed_number ?? "");
  const [issuer, setIssuer] = React.useState(deed?.issuer ?? "");
  const [deedDate, setDeedDate] = React.useState("");
  const [area, setArea] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<{ deedNumber?: string }>({});

  React.useEffect(() => {
    if (open) {
      setDeedNumber(deed?.deed_number ?? "");
      setIssuer(deed?.issuer ?? "");
      setDeedDate("");
      setArea("");
      setOwnerName("");
      setFile(null);
      setErrors({});
    }
  }, [open, deed]);

  const mutation = useMutation({
    mutationFn: async () => {
      let documentVersionId: string | null = null;

      if (file) {
        if (!entityId) throw new Error(t("analysis.selectEntityFirst"));
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const checksum = await sha256Hex(file);
        const { documentId } = await createDoc({
          data: {
            ownerEntityId: entityId,
            categoryCode: "deed",
            title: `deed-${deedNumber.trim()}`.slice(0, 200),
            visibility: "entity_private",
          },
        });
        const reserved = await reserveVersion({
          data: {
            documentId,
            fileExt: ext,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            checksumSha256: checksum,
          },
        });
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const upload = await supabase.storage
            .from(reserved.storage_bucket)
            .upload(reserved.storage_path, file, ...(file.type ? [{ contentType: file.type }] : []));
          if (upload.error) throw new Error(upload.error.message);
          await link({ data: { documentId, contextType: "property", contextId: propertyId } });
          documentVersionId = reserved.version_id;
        } catch (uploadError) {
          await abort({
            data: {
              versionId: reserved.version_id,
              reason: uploadError instanceof Error ? uploadError.message : "upload failed",
            },
          }).catch(() => undefined);
          throw new Error(t("analysis.uploadFailed"));
        }
      }

      return submit({
        data: {
          propertyId,
          deedId: deed?.id ?? null,
          deedNumber: deedNumber.trim(),
          issuer: issuer.trim() || null,
          deedDate: deedDate || null,
          area: area ? Number(area) : null,
          ownerNameSnapshot: ownerName.trim() || null,
          documentVersionId,
        },
      });
    },
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
    mutation.mutate();
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
        <div className="space-y-2">
          <Label htmlFor="deed-file">{t("analysis.pickFile")}</Label>
          <Input
            id="deed-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">{t("properties.documents.optionalFileHint")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("properties.documents.versionHint")}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setOpen(false);
              void navigate({
                to: "/documents/analyze",
                search: { propertyId, target: "deed" },
              });
            }}
          >
            <FileSearch className="me-2 size-4" />
            {t("properties.documents.analyzeFile")}
          </Button>
          <div className="flex gap-3">
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
        </div>
      </form>
    </ResponsiveModal>
  );
}
