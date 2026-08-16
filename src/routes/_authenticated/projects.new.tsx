import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardsSkeleton, ErrorState, FieldShell, HeroBadge, PageHero, SectionCard, TextAreaField, TextField } from "@/components/rakeez";
import { FolderPlus } from "lucide-react";
import { useI18n, useT } from "@/i18n";
import { useActiveAccount } from "@/lib/active-account";
import { useAccountUi } from "@/lib/account-ui";
import {
  createProject,
  listProjectTemplates,
  listStageTemplates,
} from "@/lib/projects.functions";
import { linkPropertyToProject, listProperties } from "@/lib/properties.functions";

export const Route = createFileRoute("/_authenticated/projects/new")({
  component: NewProjectPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "إنشاء مشروع جديد | ركيز" },
      {
        name: "description",
        content: "أنشئ مشروعًا جديدًا في منصة ركيز واختر نوعه لتُبنى مراحله الافتراضية تلقائيًا.",
      },
      { property: "og:title", content: "إنشاء مشروع جديد | ركيز" },
      {
        property: "og:description",
        content: "أنشئ مشروعًا جديدًا في منصة ركيز واختر نوعه لتُبنى مراحله الافتراضية تلقائيًا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function NewProjectPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { scope } = useActiveAccount();
  const { activeEntity, isDeveloper } = useAccountUi();

  const fetchTemplates = useServerFn(listProjectTemplates);
  const fetchStages = useServerFn(listStageTemplates);
  const submitProject = useServerFn(createProject);

  const entityId = scope?.kind === "entity" ? scope.entityId : null;
  const canLinkProperty = Boolean(entityId) && isDeveloper;

  const [mode, setMode] = React.useState<"property" | "none">("none");
  const [selectedProperty, setSelectedProperty] = React.useState<PropertyOption | null>(null);

  const [templateId, setTemplateId] = React.useState<string>("");
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [landArea, setLandArea] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [expectedEndDate, setExpectedEndDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [optionalCodes, setOptionalCodes] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<{
    name?: string;
    template?: string;
    property?: string;
  }>({});

  const templatesQuery = useQuery({
    queryKey: ["project-templates"],
    queryFn: () => fetchTemplates(),
  });

  const stagesQuery = useQuery({
    queryKey: ["stage-templates", templateId],
    queryFn: () => fetchStages({ data: { projectTemplateId: templateId } }),
    enabled: Boolean(templateId),
  });

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createProject>[0]) => submitProject(input),
    onSuccess: (result) => {
      toast.success(t("projects.created"));
      navigate({ to: "/projects/$projectId", params: { projectId: result.id }, replace: true });
    },
    onError: () => toast.error(t("projects.createFailed")),
  });

  const localized = (ar: string, en: string) => (locale === "ar" ? ar : en);

  const toggleOptional = (code: string, checked: boolean) => {
    setOptionalCodes((prev) =>
      checked ? [...new Set([...prev, code])] : prev.filter((c) => c !== code),
    );
  };

  const usesProperty = canLinkProperty && mode === "property";

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: { name?: string; template?: string; property?: string } = {};
    if (name.trim().length < 2) nextErrors.name = t("projects.nameRequired");
    if (!templateId) nextErrors.template = t("projects.typeRequired");
    if (usesProperty && !selectedProperty) nextErrors.property = t("projects.propertyRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    mutation.mutate({
      data: {
        projectTemplateId: templateId,
        name: name.trim(),
        entityId: scope?.kind === "entity" ? scope.entityId : null,
        // Property attributes are derived server-side; never sent from the form.
        propertyId: usesProperty ? (selectedProperty?.id ?? null) : null,
        city: usesProperty ? null : city.trim() || null,
        district: usesProperty ? null : district.trim() || null,
        landArea: usesProperty ? null : landArea ? Number(landArea) : null,
        startDate: startDate || null,
        expectedEndDate: expectedEndDate || null,
        notes: notes.trim() || null,
        optionalStageCodes: optionalCodes,
      },
    });
  };

  if (templatesQuery.isLoading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
        <CardsSkeleton cards={2} />
      </div>
    );
  }
  if (templatesQuery.isError) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState onRetry={() => void templatesQuery.refetch()} />
      </div>
    );
  }

  const templates = templatesQuery.data ?? [];
  const stages = stagesQuery.data ?? [];


  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("projects.newTitle")}
        subtitle={t("projects.newSubtitle")}
        badge={<HeroBadge tone="neutral">ركيز</HeroBadge>}
      />

      <SectionCard icon={FolderPlus} title={t("projects.newTitle")}>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <FieldShell
            id="project-type"
            label={t("projects.type")}
            hint={t("projects.typeHint")}
            error={errors.template}
            required
          >
            {(aria) => (
              <Select
                value={templateId}
                onValueChange={(value) => {
                  setTemplateId(value);
                  setOptionalCodes([]);
                }}
              >
                <SelectTrigger
                  id={aria.id}
                  aria-describedby={aria["aria-describedby"]}
                  aria-invalid={aria["aria-invalid"]}
                  className="min-h-11"
                >
                  <SelectValue placeholder={t("projects.type")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {localized(template.name_ar, template.name_en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldShell>

          <TextField
            id="project-name"
            label={t("projects.name")}
            placeholder={t("projects.namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            required
          />

          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("projects.scope")}: </span>
            {scope?.kind === "entity"
              ? (activeEntity?.name ?? t("projects.scopeEntity"))
              : t("projects.scopePersonal")}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              id="project-city"
              label={t("projects.city")}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
            <TextField
              id="project-district"
              label={t("projects.district")}
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
            />
            <TextField
              id="project-land-area"
              label={t("projects.landArea")}
              type="number"
              value={landArea}
              onChange={(event) => setLandArea(event.target.value)}
            />
            <TextField
              id="project-start-date"
              label={t("projects.startDate")}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <TextField
              id="project-expected-end-date"
              label={t("projects.expectedEndDate")}
              type="date"
              value={expectedEndDate}
              onChange={(event) => setExpectedEndDate(event.target.value)}
            />
          </div>

          <TextAreaField
            id="project-notes"
            label={t("projects.notes")}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {entityId && isDeveloper ? (
            <FieldShell
              id="project-linked-property"
              label={t("projects.linkProperty")}
              hint={t("projects.linkPropertyHint")}
            >
              {(aria) => (
                <Select value={linkedPropertyId} onValueChange={setLinkedPropertyId}>
                  <SelectTrigger id={aria.id} className="min-h-11">
                    <SelectValue placeholder={t("projects.linkPropertyPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(propertiesQuery.data ?? []).map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldShell>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {t("projects.linkPropertyNeedsDeveloper")}
            </p>
          )}

          <section aria-labelledby="stages-preview" className="rounded-xl border border-border p-4">
            <h2 id="stages-preview" className="text-base font-semibold text-foreground">
              {t("projects.stagesPreview")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("projects.stagesPreviewHint")}</p>

            {!templateId ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("projects.noTemplateSelected")}
              </p>
            ) : stagesQuery.isLoading ? (
              <div className="mt-4">
                <CardsSkeleton cards={1} />
              </div>
            ) : (
              <ol className="mt-4 space-y-2">
                {stages.map((stage) => (
                  <li
                    key={stage.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {stage.order_index}
                    </span>
                    {stage.kind === "optional" ? (
                      <Checkbox
                        id={`stage-${stage.code}`}
                        checked={optionalCodes.includes(stage.code)}
                        onCheckedChange={(checked) => toggleOptional(stage.code, checked === true)}
                      />
                    ) : (
                      <Checkbox checked disabled aria-hidden="true" />
                    )}
                    <Label
                      htmlFor={stage.kind === "optional" ? `stage-${stage.code}` : undefined}
                      className="flex-1 text-sm font-normal"
                    >
                      {localized(stage.name_ar, stage.name_en)}
                    </Label>
                    <span
                      className={
                        stage.kind === "core"
                          ? "rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {stage.kind === "core" ? t("projects.stageCore") : t("projects.stageOptional")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={mutation.isPending}>
            {mutation.isPending ? t("projects.creating") : t("projects.submit")}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
