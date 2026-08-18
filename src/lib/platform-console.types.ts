import { z } from "zod";

/**
 * Phase 30 — أنواع مركز قيادة إدارة المنصة.
 *
 * ملف آمن للعميل: مخططات قراءة فقط بلا أي وصول للقاعدة ولا أسرار.
 */

export const platformBadgesSchema = z.object({
  queueOpen: z.number(),
  dsrOpen: z.number(),
  incidentsOpen: z.number(),
  timersOverdue: z.number(),
});
export type PlatformBadges = z.infer<typeof platformBadgesSchema>;

export const namedCountSchema = z.object({ key: z.string(), count: z.number() });
export type NamedCount = z.infer<typeof namedCountSchema>;

export const activityItemSchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  source: z.enum(["permissions", "reports"]),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const growthPointSchema = z.object({
  week: z.string(),
  users: z.number(),
  entities: z.number(),
});
export type GrowthPoint = z.infer<typeof growthPointSchema>;

export const platformOverviewSchema = z.object({
  usersTotal: z.number(),
  entitiesTotal: z.number(),
  entitiesByType: namedCountSchema.array(),
  entitiesVerified: z.number(),
  entitiesPendingVerification: z.number(),
  projectsActive: z.number(),
  projectsByStatus: namedCountSchema.array(),
  requestsOpen: z.number(),
  queueOpen: z.number(),
  queueAssigned: z.number(),
  timersOverdue: z.number(),
  timersDueSoon: z.number(),
  dsrOpen: z.number(),
  dsrNextDueAt: z.string().nullable(),
  incidentsOpen: z.number(),
  incidentsNotifyDueAt: z.string().nullable(),
  integrationsByStatus: namedCountSchema.array(),
  activity: activityItemSchema.array(),
  growth: growthPointSchema.array(),
});
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;

/* ------------------------------------------------------------------ SLA */

export const slaTimerSchema = z.object({
  id: z.string(),
  subject_kind: z.string(),
  subject_id: z.string(),
  project_id: z.string().nullable(),
  entity_id: z.string().nullable(),
  started_at: z.string(),
  due_at: z.string().nullable(),
  state: z.string(),
  overdue: z.boolean(),
  hours_left: z.number().nullable(),
});
export type SlaTimer = z.infer<typeof slaTimerSchema>;

/* ------------------------------------------------------- flags & plans */

export const featureFlagSchema = z.object({
  code: z.string(),
  description_ar: z.string().nullable(),
  enabled_globally: z.boolean(),
  countries: z.array(z.object({ country_code: z.string(), enabled: z.boolean() })).default([]),
});
export type FeatureFlag = z.infer<typeof featureFlagSchema>;

export const entitlementSchema = z.object({
  code: z.string(),
  description_ar: z.string().nullable(),
  is_commercial: z.boolean(),
  granted_count: z.number(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const entityEntitlementSchema = z.object({
  entity_id: z.string(),
  entity_name: z.string().nullable(),
  code: z.string(),
  granted_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
export type EntityEntitlement = z.infer<typeof entityEntitlementSchema>;

export const flagsBoardSchema = z.object({
  flags: featureFlagSchema.array(),
  entitlements: entitlementSchema.array(),
  entityEntitlements: entityEntitlementSchema.array(),
  coreFreeActions: z.array(z.string()).default([]),
});
export type FlagsBoard = z.infer<typeof flagsBoardSchema>;

/* --------------------------------------------------------- escalations */

export const escalationPolicyRowSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  entity_name: z.string().nullable(),
  project_id: z.string().nullable(),
  subject_kind: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  trigger_after_hours: z.number(),
  is_active: z.boolean(),
  steps: z
    .array(
      z.object({
        step_no: z.number(),
        after_hours: z.number().nullable(),
        recipient_kind: z.string().nullable(),
      }),
    )
    .default([]),
});
export type EscalationPolicyRow = z.infer<typeof escalationPolicyRowSchema>;

/* -------------------------------------------------------------- legal */

export const legalVersionRowSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  code: z.string(),
  title_ar: z.string(),
  version: z.string(),
  effective_date: z.string(),
  published_at: z.string().nullable(),
  requires_acceptance: z.boolean(),
  is_current: z.boolean(),
  acceptances: z.number(),
});
export type LegalVersionRow = z.infer<typeof legalVersionRowSchema>;

export const acceptanceStatSchema = z.object({
  code: z.string(),
  title_ar: z.string(),
  version: z.string(),
  is_current: z.boolean(),
  acceptances: z.number(),
});
export type AcceptanceStat = z.infer<typeof acceptanceStatSchema>;
