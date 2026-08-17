import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Building2,
  FileText,
  Globe2,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { EntityClassificationCard } from "@/components/entities/classification-card";

import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  Num,
  PageHero,
  ResponsiveModal,
  SectionCard,
  SoftEmpty,
  TextField,
} from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { toLatinDigits } from "@/lib/format";
import {
  LEGAL_FORMS,
  RELATIONSHIP_TYPES,
  decideEntityRelationship,
  getEntityOfficial,
  listEntityRelationships,
  requestEntityRelationship,
  updateEntityOfficial,
} from "@/lib/entities.functions";
import {
  UNIFIED_NUMBER_PATTERN,
  UNIFIED_NUMBER_REQUIRED_FORMS,
} from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/entities/$entityId/")({
  component: EntityHomePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "ملف الكيان | ركيز" },
      {
        name: "description",
        content: "بيانات الكيان الرسمية والعنوان الوطني ومسؤول التواصل والعلاقات مع الكيانات الأخرى.",
      },
      { property: "og:title", content: "ملف الكيان | ركيز" },
      {
        property: "og:description",
        content: "إدارة البيانات الرسمية للكيان وفريق العمل والعلاقات، مع ضبط دقيق للصلاحيات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EDITABLE = [
  "legalNameAr",
  "legalNameEn",
  "unifiedNationalNumber",
  "crNumber",
  "taxNumber",
  "contactEmail",
  "contactPhone",
  "buildingNo",
  "street",
  "district",
  "city",
  "postalCode",
  "additionalNo",
  "responsibleName",
  "responsibleTitle",
  "responsibleEmail",
  "responsiblePhone",
] as const;
type EditableKey = (typeof EDITABLE)[number];

const SNAKE: Record<EditableKey, string> = {
  legalNameAr: "legal_name_ar",
  legalNameEn: "legal_name_en",
  unifiedNationalNumber: "unified_national_number",
  crNumber: "cr_number",
  taxNumber: "tax_number",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  buildingNo: "building_no",
  street: "street",
  district: "district",
  city: "city",
  postalCode: "postal_code",
  additionalNo: "additional_no",
  responsibleName: "responsible_name",
  responsibleTitle: "responsible_title",
  responsibleEmail: "responsible_email",
  responsiblePhone: "responsible_phone",
};

const DIGIT_KEYS = new Set<EditableKey>([
  "unifiedNationalNumber",
  "crNumber",
  "taxNumber",
  "buildingNo",
  "postalCode",
  "additionalNo",
]);

function value(v: string | null | undefined, fallback: string) {
  if (!v) return fallback;
  return v;
}

function EntityHomePage() {
  const t = useT();
  const { entityId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchOfficial = useServerFn(getEntityOfficial);
  const fetchRelations = useServerFn(listEntityRelationships);
  const saveOfficial = useServerFn(updateEntityOfficial);
  const askRelation = useServerFn(requestEntityRelationship);
  const decideRelation = useServerFn(decideEntityRelationship);

  const officialQuery = useQuery({
    queryKey: ["entity-official", entityId],
    queryFn: () => fetchOfficial({ data: { entityId } }),
  });
  const relationsQuery = useQuery({
    queryKey: ["entity-relationships", entityId],
    queryFn: () => fetchRelations({ data: { entityId } }),
  });

  const canManage = officialQuery.data?.canManage ?? false;

  const [editOpen, setEditOpen] = React.useState(false);
  const [relationOpen, setRelationOpen] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [legalForm, setLegalForm] = React.useState<string>("company");
  const [relation, setRelation] = React.useState({
    targetSlug: "",
    relationshipType: "partner_of" as (typeof RELATIONSHIP_TYPES)[number],
    ownershipPercent: "",
  });

  const openEdit = () => {
    const data = officialQuery.data;
    if (!data) return;
    const next: Record<string, string> = {};
    for (const key of EDITABLE) {
      next[key] = (data as unknown as Record<string, string | null>)[SNAKE[key]] ?? "";
    }
    setForm(next);
    setLegalForm(data.legal_form ?? "company");
    setEditOpen(true);
  };

  const showError = (error: Error) => {
    const key = `entities.errors.${error.message}`;
    const message = t(key);
    toast.error(message === key ? t("entities.errors.UNKNOWN") : message);
  };

  const saveMutation = useMutation({
    mutationFn: () => saveOfficial({ data: { entityId, legalForm, ...form } as never }),
    onSuccess: async () => {
      toast.success(t("entities.saved"));
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["entity-official", entityId] });
    },
    onError: showError,
  });

  const relationMutation = useMutation({
    mutationFn: () =>
      askRelation({
        data: {
          entityId,
          targetSlug: relation.targetSlug.trim(),
          relationshipType: relation.relationshipType,
          ownershipPercent: relation.ownershipPercent
            ? Number(toLatinDigits(relation.ownershipPercent))
            : null,
        },
      }),
    onSuccess: async () => {
      toast.success(t("entities.relations.requested"));
      setRelationOpen(false);
      setRelation({ targetSlug: "", relationshipType: "partner_of", ownershipPercent: "" });
      await queryClient.invalidateQueries({ queryKey: ["entity-relationships", entityId] });
    },
    onError: showError,
  });

  const decideMutation = useMutation({
    mutationFn: (input: { relationshipId: string; accept: boolean }) =>
      decideRelation({ data: input }),
    onSuccess: async () => {
      toast.success(t("entities.relations.decided"));
      await queryClient.invalidateQueries({ queryKey: ["entity-relationships", entityId] });
    },
    onError: showError,
  });

  const dash = t("common.notProvided");
  const data = officialQuery.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={data?.name ?? t("entities.detail.title")}
        subtitle={t("entities.detail.subtitle")}
      />

      {officialQuery.isPending ? (
        <CardsSkeleton cards={3} />
      ) : officialQuery.isError ? (
        <ErrorState
          description={t("entities.detail.loadError")}
          onRetry={() => void officialQuery.refetch()}
        />
      ) : data ? (
        <>
          <SectionCard
            title={t("entities.detail.official")}
            icon={Building2}
            action={
              canManage ? (
                <Button variant="outline" size="sm" className="min-h-11" onClick={openEdit}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {t("common.edit")}
                </Button>
              ) : undefined
            }
          >
            <FieldGrid>
              <Field label={t("entities.fields.type")} value={t(`entities.types.${data.type}`)} />
              <Field
                label={t("entities.fields.legalForm")}
                value={data.legal_form ? t(`entities.legalForms.${data.legal_form}`) : dash}
              />
              <Field label={t("entities.fields.legalNameAr")} value={value(data.legal_name_ar, dash)} />
              <Field label={t("entities.fields.legalNameEn")} value={value(data.legal_name_en, dash)} />
              <Field
                label={t("entities.fields.unifiedNationalNumber")}
                value={
                  data.unified_national_number ? <Num>{data.unified_national_number}</Num> : dash
                }
              />
              <Field
                label={t("entities.fields.crNumber")}
                value={data.cr_number ? <Num>{data.cr_number}</Num> : dash}
              />
              <Field
                label={t("entities.fields.taxNumber")}
                value={data.tax_number ? <Num>{data.tax_number}</Num> : dash}
              />
              <Field
                label={t("entities.fields.contactEmail")}
                value={value(data.contact_email, dash)}
              />
              <Field
                label={t("entities.fields.contactPhone")}
                value={data.contact_phone ? <Num>{data.contact_phone}</Num> : dash}
              />

              <Field
                label={t("entities.unnStatus.label")}
                value={
                  !data.unified_national_number
                    ? t("entities.unnStatus.none")
                    : data.verification_status === "verified"
                      ? t("entities.unnStatus.verified")
                      : t("entities.unnStatus.formatOk")
                }
              />
              <Field
                label={t("entities.detail.verification")}
                value={t(`entities.verification.${data.verification_status ?? "unverified"}`)}
              />
            </FieldGrid>
            <p className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              {t("entities.unnStatus.nafathDisabled")}
            </p>
          </SectionCard>

          <EntityClassificationCard entityId={entityId} canManage={canManage} />

          <SectionCard title={t("entities.detail.address")} icon={MapPin}>
            <FieldGrid>
              <Field
                label={t("entities.fields.buildingNo")}
                value={data.building_no ? <Num>{data.building_no}</Num> : dash}
              />
              <Field label={t("entities.fields.street")} value={value(data.street, dash)} />
              <Field label={t("entities.fields.district")} value={value(data.district, dash)} />
              <Field label={t("entities.fields.city")} value={value(data.city, dash)} />
              <Field
                label={t("entities.fields.postalCode")}
                value={data.postal_code ? <Num>{data.postal_code}</Num> : dash}
              />
              <Field
                label={t("entities.fields.additionalNo")}
                value={data.additional_no ? <Num>{data.additional_no}</Num> : dash}
              />
            </FieldGrid>
          </SectionCard>

          <SectionCard title={t("entities.detail.responsible")} icon={UserRound}>
            <FieldGrid>
              <Field
                label={t("entities.fields.responsibleName")}
                value={value(data.responsible_name, dash)}
              />
              <Field
                label={t("entities.fields.responsibleTitle")}
                value={value(data.responsible_title, dash)}
              />
              <Field
                label={t("entities.fields.responsibleEmail")}
                value={value(data.responsible_email, dash)}
              />
              <Field
                label={t("entities.fields.responsiblePhone")}
                value={data.responsible_phone ? <Num>{data.responsible_phone}</Num> : dash}
              />
            </FieldGrid>
          </SectionCard>
        </>
      ) : null}

      <SectionCard
        title={t("entities.relations.title")}
        icon={Link2}
        action={
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setRelationOpen(true)}
            >
              {t("entities.relations.add")}
            </Button>
          ) : undefined
        }
      >
        {relationsQuery.isPending ? (
          <CardsSkeleton cards={2} />
        ) : relationsQuery.isError ? (
          <ErrorState description={t("entities.relations.loadError")} />
        ) : (relationsQuery.data?.length ?? 0) === 0 ? (
          <SoftEmpty
            icon={Link2}
            message={t("entities.relations.emptyBody")}
          />
        ) : (
          <ul className="space-y-3">
            {relationsQuery.data?.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{row.counterpart_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`entities.relations.types.${row.relationship_type}`)} ·{" "}
                    {t(`entities.relations.status.${row.status}`)}
                  </span>
                </div>
                {row.ownership_percent !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("entities.relations.ownership")}: <Num>{row.ownership_percent}</Num>%
                  </p>
                ) : null}
                {canManage && row.status === "pending" && row.direction === "incoming" ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      className="min-h-11 flex-1"
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ relationshipId: row.id, accept: true })
                      }
                    >
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      {t("common.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 flex-1"
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ relationshipId: row.id, accept: false })
                      }
                    >
                      {t("common.reject")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/entities/$entityId/team"
          params={{ entityId }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40"
        >
          <Users className="size-4" aria-hidden="true" />
          {t("entities.detail.team")}
        </Link>
        <Link
          to="/entities/$entityId/invitations"
          params={{ entityId }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40"
        >
          <UserRound className="size-4" aria-hidden="true" />
          {t("entities.detail.invitations")}
        </Link>
        <Link
          to="/entities/$entityId/public-profile"
          params={{ entityId }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40"
        >
          <Globe2 className="size-4" aria-hidden="true" />
          {t("entities.detail.publicProfile")}
        </Link>
        <Link
          to="/documents"
          search={{ entityId }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40"
        >
          <FileText className="size-4" aria-hidden="true" />
          {t("entities.detail.documents")}
        </Link>
      </div>

      <ResponsiveModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t("entities.detail.editTitle")}
        description={t("entities.detail.editBody")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="edit-legal-form">
              {t("entities.fields.legalForm")}
            </label>
            <Select value={legalForm} onValueChange={setLegalForm}>
              <SelectTrigger id="edit-legal-form" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_FORMS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`entities.legalForms.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {EDITABLE.map((key) => {
            const isUnn = key === "unifiedNationalNumber";
            const unnRequired =
              isUnn &&
              UNIFIED_NUMBER_REQUIRED_FORMS.includes(
                legalForm as (typeof UNIFIED_NUMBER_REQUIRED_FORMS)[number],
              );
            const current = form[key] ?? "";
            const unnError = isUnn
              ? !current && unnRequired
                ? t("entities.errors.unifiedNumberRequired")
                : current && !UNIFIED_NUMBER_PATTERN.test(current)
                  ? t("entities.errors.unifiedNumber")
                  : undefined
              : undefined;
            return (
              <TextField
                key={key}
                id={`edit-${key}`}
                label={t(`entities.fields.${key}`)}
                value={current}
                {...(unnRequired ? { required: true } : {})}
                {...(isUnn
                  ? {
                      hint: `${t("entities.hints.unifiedNumber")} ${t("entities.hints.unifiedNumberRequired")}`,
                    }
                  : {})}
                {...(unnError ? { error: unnError } : {})}
                onChange={(event) => {
                  const raw = toLatinDigits(event.target.value);
                  setForm((f) => ({
                    ...f,
                    [key]: DIGIT_KEYS.has(key)
                      ? raw.replace(/[^0-9]/g, "").slice(0, isUnn ? 10 : undefined)
                      : raw,
                  }));
                }}
              />
            );
          })}
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            className="min-h-11 flex-1"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t("common.save")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            disabled={saveMutation.isPending}
            onClick={() => setEditOpen(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={relationOpen}
        onOpenChange={setRelationOpen}
        title={t("entities.relations.add")}
        description={t("entities.relations.addBody")}
      >
        <div className="space-y-4">
          <TextField
            id="relation-slug"
            label={t("entities.relations.targetSlug")}
            hint={t("entities.relations.targetSlugHint")}
            required
            value={relation.targetSlug}
            onChange={(event) =>
              setRelation((r) => ({ ...r, targetSlug: event.target.value.trim() }))
            }
          />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="relation-type">
              {t("entities.relations.type")}
            </label>
            <Select
              value={relation.relationshipType}
              onValueChange={(v) =>
                setRelation((r) => ({
                  ...r,
                  relationshipType: v as (typeof RELATIONSHIP_TYPES)[number],
                }))
              }
            >
              <SelectTrigger id="relation-type" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`entities.relations.types.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField
            id="relation-percent"
            label={t("entities.relations.ownership")}
            value={relation.ownershipPercent}
            onChange={(event) =>
              setRelation((r) => ({
                ...r,
                ownershipPercent: toLatinDigits(event.target.value).replace(/[^0-9.]/g, ""),
              }))
            }
          />
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            className="min-h-11 flex-1"
            disabled={relationMutation.isPending || relation.targetSlug.trim().length < 2}
            onClick={() => relationMutation.mutate()}
          >
            {relationMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t("entities.relations.send")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            disabled={relationMutation.isPending}
            onClick={() => setRelationOpen(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}
