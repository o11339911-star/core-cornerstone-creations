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
import { addLicenseVersion } from "@/lib/properties.functions";
import {
  createDocument,
  linkDocument,
  reserveDocumentVersion,
} from "@/lib/documents.functions";
import { abortUpload } from "@/lib/analysis.functions";

export type LicenseHead = {
  id: string;
  license_number: string | null;
  authority: string | null;
} | null;

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { scope } = useActiveAccount();
  const entityId = scope?.kind === "entity" ? scope.entityId : null;

  const submit = useServerFn(addLicenseVersion);
  const createDoc = useServerFn(createDocument);
  const reserveVersion = useServerFn(reserveDocumentVersion);
  const link = useServerFn(linkDocument);
  const abort = useServerFn(abortUpload);

  const [open, setOpen] = React.useState(false);

  const [licenseNumber, setLicenseNumber] = React.useState(license?.license_number ?? "");
  const [authority, setAuthority] = React.useState(license?.authority ?? "");
  const [issuedOn, setIssuedOn] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [scopeText, setScopeText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<{ licenseNumber?: string }>({});

  React.useEffect(() => {
    if (open) {
      setLicenseNumber(license?.license_number ?? "");
      setAuthority(license?.authority ?? "");
      setIssuedOn("");
      setExpiresOn("");
      setScopeText("");
      setFile(null);
      setErrors({});
    }
  }, [open, license]);

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
            categoryCode: "building_license",
            title: `license-${licenseNumber.trim()}`.slice(0, 200),
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
          licenseId: license?.id ?? null,
          licenseNumber: licenseNumber.trim(),
          authority: authority.trim() || null,
          issuedOn: issuedOn || null,
          expiresOn: expiresOn || null,
          scopeText: scopeText.trim() || null,
          documentVersionId,
        },
      });
    },
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
    mutation.mutate();
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
        <div className="space-y-2">
          <Label htmlFor="license-file">{t("analysis.pickFile")}</Label>
          <Input
            id="license-file"
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
                search: { propertyId, target: "building_license" },
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
