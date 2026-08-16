import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ErrorState,
  FieldShell,
  HeroBadge,
  PageHero,
  SectionCard,
  TextAreaField,
  TextField,
} from "@/components/rakeez";
import { useT } from "@/i18n";
import { useAccountUi } from "@/lib/account-ui";
import { PROPERTY_KINDS, createProperty, type PropertyKind } from "@/lib/properties.functions";

export const Route = createFileRoute("/_authenticated/properties/new")({
  component: NewPropertyPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "إضافة عقار جديد | ركيز" },
      {
        name: "description",
        content: "أضف عقارًا جديدًا إلى منصة ركيز وابدأ ملفه العقاري الموحّد بالبيانات الأساسية.",
      },
      { property: "og:title", content: "إضافة عقار جديد | ركيز" },
      {
        property: "og:description",
        content: "أضف عقارًا جديدًا إلى منصة ركيز وابدأ ملفه العقاري الموحّد بالبيانات الأساسية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function NewPropertyPage() {
  const t = useT();
  const navigate = useNavigate();
  const account = useAccountUi();
  const entityId = account.isDeveloper ? (account.activeEntity?.id ?? null) : null;
  const submit = useServerFn(createProperty);

  const [kind, setKind] = React.useState<PropertyKind | "">("");
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [landArea, setLandArea] = React.useState("");
  const [planNo, setPlanNo] = React.useState("");
  const [parcelNo, setParcelNo] = React.useState("");
  const [approxLat, setApproxLat] = React.useState("");
  const [approxLng, setApproxLng] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<{ name?: string; kind?: string }>({});

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createProperty>[0]) => submit(input),
    onSuccess: (result) => {
      toast.success(t("properties.created"));
      navigate({
        to: "/properties/$propertyId",
        params: { propertyId: result.id },
        replace: true,
      });
    },
    onError: () => toast.error(t("properties.createFailed")),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: { name?: string; kind?: string } = {};
    if (name.trim().length < 2) nextErrors.name = t("properties.nameRequired");
    if (!kind) nextErrors.kind = t("properties.kindRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !kind) return;

    mutation.mutate({
      data: {
        kind,
        name: name.trim(),
        entityId: scope?.kind === "entity" ? scope.entityId : null,
        city: city.trim(),
        district: district.trim(),
        landArea: landArea ? Number(landArea) : null,
        planNo: planNo.trim(),
        parcelNo: parcelNo.trim(),
        approxLat: approxLat ? Number(approxLat) : null,
        approxLng: approxLng ? Number(approxLng) : null,
        notes: notes.trim(),
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={t("properties.newTitle")}
        subtitle={t("properties.newSubtitle")}
        badge={<HeroBadge tone="neutral">{t("properties.title")}</HeroBadge>}
      />

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <SectionCard icon={Building2} title={t("properties.newTitle")}>
          <div className="space-y-6">
            <FieldShell id="property-kind" label={t("properties.kind")} error={errors.kind} required>
              {(aria) => (
                <Select value={kind} onValueChange={(value) => setKind(value as PropertyKind)}>
                  <SelectTrigger
                    id={aria.id}
                    aria-describedby={aria["aria-describedby"]}
                    aria-invalid={aria["aria-invalid"]}
                    className="min-h-11"
                  >
                    <SelectValue placeholder={t("properties.kind")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`properties.kinds.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldShell>

            <TextField
              id="property-name"
              label={t("properties.name")}
              placeholder={t("properties.namePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
              required
            />

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t("properties.scope")}: </span>
              {scope?.kind === "entity" ? scope.entityId : t("properties.scopePersonal")}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <TextField
                id="property-city"
                label={t("properties.city")}
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
              <TextField
                id="property-district"
                label={t("properties.district")}
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
              />
              <TextField
                id="property-area"
                label={t("properties.landArea")}
                type="number"
                value={landArea}
                onChange={(event) => setLandArea(event.target.value)}
              />
              <TextField
                id="property-plan"
                label={t("properties.planNo")}
                value={planNo}
                onChange={(event) => setPlanNo(event.target.value)}
              />
              <TextField
                id="property-parcel"
                label={t("properties.parcelNo")}
                value={parcelNo}
                onChange={(event) => setParcelNo(event.target.value)}
              />
            </div>

            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-2 text-sm font-medium text-foreground">
                {t("properties.approxLocation")}
              </legend>
              <div className="grid gap-6 sm:grid-cols-2">
                <TextField
                  id="property-lat"
                  label={t("properties.latitude")}
                  type="number"
                  value={approxLat}
                  onChange={(event) => setApproxLat(event.target.value)}
                />
                <TextField
                  id="property-lng"
                  label={t("properties.longitude")}
                  type="number"
                  value={approxLng}
                  onChange={(event) => setApproxLng(event.target.value)}
                />
              </div>
            </fieldset>

            <TextAreaField
              id="property-notes"
              label={t("properties.notes")}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
            />
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={mutation.isPending}>
            {mutation.isPending ? t("properties.creating") : t("properties.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
