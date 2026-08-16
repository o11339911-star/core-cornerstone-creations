import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Building2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, PageHero, SectionCard, TextField } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { useActiveAccount } from "@/lib/active-account";
import { toLatinDigits } from "@/lib/format";
import { ENTITY_TYPES, LEGAL_FORMS, createEntity } from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/entities/new")({
  component: NewEntityPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "إضافة كيان جديد | ركيز" },
      {
        name: "description",
        content:
          "سجّل كيانًا جديدًا في ركيز: النوع والشكل النظامي والأرقام الرسمية والعنوان الوطني ومسؤول التواصل.",
      },
      { property: "og:title", content: "إضافة كيان جديد | ركيز" },
      {
        property: "og:description",
        content: "خطوات قصيرة لتسجيل كيان جديد وتصبح مالكه مباشرة داخل ركيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Form = {
  name: string;
  type: string;
  legalForm: string;
  legalNameAr: string;
  legalNameEn: string;
  unifiedNationalNumber: string;
  crNumber: string;
  taxNumber: string;
  contactEmail: string;
  contactPhone: string;
  buildingNo: string;
  street: string;
  district: string;
  city: string;
  postalCode: string;
  additionalNo: string;
  responsibleName: string;
  responsibleTitle: string;
  responsibleEmail: string;
  responsiblePhone: string;
};

const EMPTY: Form = {
  name: "",
  type: "developer",
  legalForm: "company",
  legalNameAr: "",
  legalNameEn: "",
  unifiedNationalNumber: "",
  crNumber: "",
  taxNumber: "",
  contactEmail: "",
  contactPhone: "",
  buildingNo: "",
  street: "",
  district: "",
  city: "",
  postalCode: "",
  additionalNo: "",
  responsibleName: "",
  responsibleTitle: "",
  responsibleEmail: "",
  responsiblePhone: "",
};

/** Digit-only official identifiers are normalised and length-checked locally. */
const DIGIT_FIELDS: Partial<Record<keyof Form, { min: number; max: number }>> = {
  unifiedNationalNumber: { min: 10, max: 15 },
  crNumber: { min: 10, max: 15 },
  taxNumber: { min: 15, max: 15 },
  buildingNo: { min: 1, max: 8 },
  postalCode: { min: 5, max: 5 },
  additionalNo: { min: 4, max: 4 },
};

const STEP_FIELDS: (keyof Form)[][] = [
  ["name", "type", "legalForm", "legalNameAr", "legalNameEn"],
  ["unifiedNationalNumber", "crNumber", "taxNumber", "contactEmail", "contactPhone"],
  ["buildingNo", "street", "district", "city", "postalCode", "additionalNo"],
  ["responsibleName", "responsibleTitle", "responsibleEmail", "responsiblePhone"],
];

function NewEntityPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setScope } = useActiveAccount();
  const submit = useServerFn(createEntity);

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<Form>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof Form, string>>>({});

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const next = DIGIT_FIELDS[key] ? toLatinDigits(raw).replace(/[^0-9]/g, "") : toLatinDigits(raw);
    setForm((f) => ({ ...f, [key]: next }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (fields: (keyof Form)[]) => {
    const next: Partial<Record<keyof Form, string>> = {};
    for (const key of fields) {
      const value = form[key].trim();
      if (key === "name" && value.length < 2) next[key] = t("entities.errors.nameRequired");
      const rule = DIGIT_FIELDS[key];
      if (rule && value && (value.length < rule.min || value.length > rule.max)) {
        next[key] = t("entities.errors.digitLength", { min: rule.min, max: rule.max });
      }
      if ((key === "contactEmail" || key === "responsibleEmail") && value && !value.includes("@")) {
        next[key] = t("entities.errors.email");
      }
    }
    setErrors((e) => ({ ...e, ...next }));
    return Object.keys(next).length === 0;
  };

  const mutation = useMutation({
    mutationFn: () => submit({ data: { ...form, type: form.type, legalForm: form.legalForm } as never }),
    onSuccess: async ({ entityId }) => {
      toast.success(t("entities.created"));
      await queryClient.invalidateQueries({ queryKey: ["my-memberships"] });
      setScope({ kind: "entity", entityId });
      void navigate({ to: "/entities/$entityId", params: { entityId } });
    },
    onError: (error: Error) => {
      const key = `entities.errors.${error.message}`;
      const message = t(key);
      toast.error(message === key ? t("entities.errors.UNKNOWN") : message);
    },
  });

  const last = step === STEP_FIELDS.length - 1;

  const next = () => {
    if (!validate(STEP_FIELDS[step] ?? [])) return;
    if (last) {
      if (!validate(STEP_FIELDS.flat())) return;
      mutation.mutate();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero title={t("entities.new.title")} subtitle={t("entities.new.subtitle")} />

      <ol className="flex items-center gap-2" aria-label={t("entities.new.steps")}>
        {STEP_FIELDS.map((_, index) => (
          <li
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index <= step ? "bg-primary" : "bg-muted"
            }`}
            aria-current={index === step ? "step" : undefined}
          />
        ))}
      </ol>

      <SectionCard title={t(`entities.new.step${step + 1}`)} icon={Building2}>
        <div className="grid gap-4 sm:grid-cols-2">
          {step === 0 ? (
            <>
              <TextField
                id="entity-name"
                label={t("entities.fields.name")}
                required
                value={form.name}
                onChange={set("name")}
                error={errors.name}
                className="sm:col-span-2"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="entity-type">
                  {t("entities.fields.type")}
                </label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}
                >
                  <SelectTrigger id="entity-type" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`entities.types.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="entity-legal-form">
                  {t("entities.fields.legalForm")}
                </label>
                <Select
                  value={form.legalForm}
                  onValueChange={(value) => setForm((f) => ({ ...f, legalForm: value }))}
                >
                  <SelectTrigger id="entity-legal-form" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_FORMS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`entities.legalForms.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField
                id="legal-name-ar"
                label={t("entities.fields.legalNameAr")}
                value={form.legalNameAr}
                onChange={set("legalNameAr")}
                error={errors.legalNameAr}
              />
              <TextField
                id="legal-name-en"
                label={t("entities.fields.legalNameEn")}
                value={form.legalNameEn}
                onChange={set("legalNameEn")}
                error={errors.legalNameEn}
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <TextField
                id="unn"
                label={t("entities.fields.unifiedNationalNumber")}
                hint={t("entities.hints.digitsOnly")}
                value={form.unifiedNationalNumber}
                onChange={set("unifiedNationalNumber")}
                error={errors.unifiedNationalNumber}
              />
              <TextField
                id="cr"
                label={t("entities.fields.crNumber")}
                hint={t("entities.hints.digitsOnly")}
                value={form.crNumber}
                onChange={set("crNumber")}
                error={errors.crNumber}
              />
              <TextField
                id="tax"
                label={t("entities.fields.taxNumber")}
                hint={t("entities.hints.digitsOnly")}
                value={form.taxNumber}
                onChange={set("taxNumber")}
                error={errors.taxNumber}
              />
              <TextField
                id="contact-email"
                label={t("entities.fields.contactEmail")}
                type="email"
                value={form.contactEmail}
                onChange={set("contactEmail")}
                error={errors.contactEmail}
              />
              <TextField
                id="contact-phone"
                label={t("entities.fields.contactPhone")}
                value={form.contactPhone}
                onChange={set("contactPhone")}
                error={errors.contactPhone}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <TextField
                id="building-no"
                label={t("entities.fields.buildingNo")}
                value={form.buildingNo}
                onChange={set("buildingNo")}
                error={errors.buildingNo}
              />
              <TextField
                id="street"
                label={t("entities.fields.street")}
                value={form.street}
                onChange={set("street")}
                error={errors.street}
              />
              <TextField
                id="district"
                label={t("entities.fields.district")}
                value={form.district}
                onChange={set("district")}
                error={errors.district}
              />
              <TextField
                id="city"
                label={t("entities.fields.city")}
                value={form.city}
                onChange={set("city")}
                error={errors.city}
              />
              <TextField
                id="postal-code"
                label={t("entities.fields.postalCode")}
                value={form.postalCode}
                onChange={set("postalCode")}
                error={errors.postalCode}
              />
              <TextField
                id="additional-no"
                label={t("entities.fields.additionalNo")}
                value={form.additionalNo}
                onChange={set("additionalNo")}
                error={errors.additionalNo}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <TextField
                id="responsible-name"
                label={t("entities.fields.responsibleName")}
                value={form.responsibleName}
                onChange={set("responsibleName")}
                error={errors.responsibleName}
              />
              <TextField
                id="responsible-title"
                label={t("entities.fields.responsibleTitle")}
                value={form.responsibleTitle}
                onChange={set("responsibleTitle")}
                error={errors.responsibleTitle}
              />
              <TextField
                id="responsible-email"
                label={t("entities.fields.responsibleEmail")}
                type="email"
                value={form.responsibleEmail}
                onChange={set("responsibleEmail")}
                error={errors.responsibleEmail}
              />
              <TextField
                id="responsible-phone"
                label={t("entities.fields.responsiblePhone")}
                value={form.responsiblePhone}
                onChange={set("responsiblePhone")}
                error={errors.responsiblePhone}
              />
              <p className="sm:col-span-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                {t("entities.new.verificationNote")}
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            onClick={next}
            disabled={mutation.isPending}
            className="min-h-11 flex-1"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : last ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <ArrowLeft className="size-4" aria-hidden="true" />
            )}
            {last ? t("entities.new.submit") : t("common.next")}
          </Button>
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              disabled={mutation.isPending}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              {t("common.back")}
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
