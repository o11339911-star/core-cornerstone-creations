import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 24 — appointments.
 *
 * UTC is the single source of truth (`starts_at`); each side stores its own
 * IANA timezone for display. Reminders reuse the existing duration timers and
 * notification engine, and cancellation is refused past the agreed deadline.
 * Built-in calling is intentionally deferred — no integration is claimed.
 */

const uuid = z.string().uuid();

export const appointmentSchema = z.object({
  id: z.string().uuid(),
  requester_entity_id: z.string().uuid(),
  provider_entity_id: z.string().uuid(),
  listing_id: z.string().uuid().nullable(),
  kind: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  starts_at: z.string(),
  duration_minutes: z.number(),
  requester_timezone: z.string(),
  provider_timezone: z.string(),
  cancel_deadline_at: z.string().nullable(),
  status: z.string(),
  cancel_reason: z.string().nullable(),
  created_at: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

const COLS =
  "id, requester_entity_id, provider_entity_id, listing_id, kind, title, notes, starts_at, duration_minutes, requester_timezone, provider_timezone, cancel_deadline_at, status, cancel_reason, created_at";

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Appointment[]> => {
    const { data, error } = await context.supabase
      .from("appointments")
      .select(COLS)
      .order("starts_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return z.array(appointmentSchema).parse(data ?? []);
  });

export const proposeAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requesterEntityId: uuid,
        providerEntityId: uuid,
        kind: z.string().min(2),
        title: z.string().min(3).max(160),
        startsAt: z.string(),
        requesterTimezone: z.string().min(3),
        providerTimezone: z.string().min(3),
        durationMinutes: z.number().int().min(15).max(480).default(60),
        listingId: uuid.nullable().default(null),
        cancelHours: z.number().int().min(0).max(168).default(24),
        notes: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("propose_appointment", {
      _requester_entity_id: data.requesterEntityId,
      _provider_entity_id: data.providerEntityId,
      _kind: data.kind,
      _title: data.title,
      _starts_at: data.startsAt,
      _requester_timezone: data.requesterTimezone,
      _provider_timezone: data.providerTimezone,
      _duration_minutes: data.durationMinutes,
      _cancel_hours: data.cancelHours,
      ...(data.listingId ? { _listing_id: data.listingId } : {}),
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const confirmAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_appointment", {
      _appointment_id: data.appointmentId,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ appointmentId: uuid, reason: z.string().max(500).nullable().default(null) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_appointment", {
      _appointment_id: data.appointmentId,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  });

/**
 * بحث آمن عن كيان مقدّم الخدمة برقم من 10 أرقام لاتينية.
 * لا يُرجع معرّف الكيان إلى المتصفح — الاسم المعروض فقط.
 */
export const lookupProviderEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ number: z.string().trim().max(10) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: string; name?: string }> => {
    const { resolveProviderEntity } = await import("@/lib/appointment-provider.server");
    const res = await resolveProviderEntity({
      digits: data.number,
      actorUserId: context.userId,
    });
    return res.status === "found"
      ? { status: "found", name: res.displayName }
      : { status: res.status };
  });

/**
 * حجز موعد: الطالب هو الحساب/الكيان النشط، ومقدّم الخدمة يُحل خادميًا من رقمه.
 * التوقيت المرجعي UTC، والإدخال والعرض بتوقيت الرياض (UTC+03، بلا توقيت صيفي).
 */
export const bookAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requesterEntityId: uuid,
        providerNumber: z.string().trim().regex(/^[0-9]{10}$/),
        kind: z.string().min(2),
        title: z.string().trim().min(3).max(160),
        // "YYYY-MM-DDTHH:mm" بتوقيت الرياض
        startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        cancelHours: z.number().int().min(0).max(168).nullable().default(null),
        notes: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; startsAt: string }> => {
    const { resolveProviderEntity } = await import("@/lib/appointment-provider.server");
    const provider = await resolveProviderEntity({
      digits: data.providerNumber,
      actorUserId: context.userId,
    });
    if (provider.status !== "found") throw new Error(`PROVIDER_${provider.status.toUpperCase()}`);

    const startsAt = new Date(`${data.startsAtLocal}:00+03:00`).toISOString();
    if (Number.isNaN(Date.parse(startsAt))) throw new Error("INVALID_DATETIME");

    const { data: id, error } = await context.supabase.rpc("propose_appointment", {
      _requester_entity_id: data.requesterEntityId,
      _provider_entity_id: provider.entityId,
      _kind: data.kind,
      _title: data.title,
      _starts_at: startsAt,
      _requester_timezone: "Asia/Riyadh",
      _provider_timezone: "Asia/Riyadh",
      _cancel_hours: data.cancelHours ?? 0,
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error) throw new Error(error.message);
    return { id: id as string, startsAt };
  });

