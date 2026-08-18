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

/** أرقام عربية-هندية/فارسية: تُرفض خادميًا ولا تُحوَّل صامتًا. */
const NON_LATIN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;
const latinOnly = (v: string) => !NON_LATIN_DIGITS.test(v);

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

/** صف الموعد كما يراه صاحب العلاقة، مع الدور والإجراءات المسموحة — كلها من الخادم. */
export const myAppointmentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: z.string(),
  status: z.string(),
  starts_at: z.string(),
  created_at: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  requester_label: z.string().nullable().default(null),
  provider_label: z.string().nullable().default(null),
  previous_starts_at: z.string().nullable().default(null),
  cancel_deadline_at: z.string().nullable().default(null),
  confirmed_at: z.string().nullable().default(null),
  my_side: z.enum(["requester", "provider"]),
  pending_party: z.enum(["requester", "provider"]).nullable().default(null),
  can_confirm: z.boolean(),
  can_cancel: z.boolean(),
  can_reschedule: z.boolean(),
});
export type MyAppointment = z.infer<typeof myAppointmentSchema>;


type SupabaseLike = { rpc: Function; from: Function };

/**
 * جهة المستخدم من الموعد عند غياب دالة القاعدة بعد (قبل تطبيق الهجرة 04):
 * تُحسب خادميًا من عضويات الكيانات ومُنشئ الموعد، لا من الواجهة.
 */
async function deriveRowsServerSide(
  supabase: SupabaseLike,
  userId: string,
): Promise<MyAppointment[]> {
  const { data: rows, error } = await supabase
    .from("appointments")
    .select(
      "id, title, kind, status, starts_at, created_at, cancel_deadline_at, created_by, requester_entity_id, provider_entity_id",
    )
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const { data: memberships } = await supabase
    .from("entity_memberships")
    .select("entity_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const mine = new Set<string>(
    ((memberships ?? []) as Array<{ entity_id: string }>).map((m) => m.entity_id),
  );

  // أسماء الكيانات المعروضة فقط — لا معرّفات ولا بيانات تواصل.
  const entityIds = Array.from(
    new Set(
      ((rows ?? []) as Array<Record<string, string | null>>).flatMap((r) =>
        [r['requester_entity_id'], r['provider_entity_id']].filter(Boolean),
      ) as string[],
    ),
  );
  const labels = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: ents } = await supabase.from("entities").select("id, name").in("id", entityIds);
    for (const e of ((ents ?? []) as Array<{ id: string; name: string | null }>))
      if (e.name) labels.set(e.id, e.name);
  }

  const out: MyAppointment[] = [];
  for (const r of (rows ?? []) as Array<Record<string, string | null>>) {
    const isRequester =
      r['created_by'] === userId ||
      (!!r['requester_entity_id'] && mine.has(r['requester_entity_id'] as string));
    const isProvider = !!r['provider_entity_id'] && mine.has(r['provider_entity_id'] as string);
    // المُنشئ/الطالب يبقى في جهة الطلب حتى لو كان عضوًا في الطرفين.
    const side = isRequester ? "requester" : isProvider ? "provider" : null;
    if (!side) continue;
    const status = String(r['status']);
    const pending = status === "proposed" || status === "postponed";
    out.push({
      id: String(r['id']),
      title: String(r['title'] ?? ""),
      kind: String(r['kind'] ?? ""),
      status,
      starts_at: String(r['starts_at']),
      created_at: (r['created_at'] as string | null) ?? null,
      reference: null,
      requester_label: labels.get(String(r['requester_entity_id'])) ?? null,
      provider_label: labels.get(String(r['provider_entity_id'])) ?? null,
      previous_starts_at: null,
      cancel_deadline_at: (r['cancel_deadline_at'] as string | null) ?? null,
      confirmed_at: null,
      my_side: side,
      pending_party: pending ? "provider" : null,
      can_confirm: pending && side === "provider" && r['created_by'] !== userId,
      can_cancel: pending || status === "confirmed",
      can_reschedule: pending || status === "confirmed",
    });
  }
  return out;
}


/** مواعيدي مع الدور والإجراءات — مصدرها الخادم حصرًا. */
export const listMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAppointment[]> => {
    // الدوال الجديدة غير موجودة في أنواع القاعدة المولّدة قبل تطبيق الهجرة 04.
    const rpc = (context.supabase as unknown as SupabaseLike).rpc as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc("list_my_appointments");
    if (!error) return z.array(myAppointmentSchema).parse(data ?? []);
    // الدالة غير موجودة بعد: اشتقاق خادمي مكافئ بلا كشف أي موعد لطرف ثالث.
    if (/list_my_appointments|does not exist|PGRST202|42883/i.test(error.message))
      return deriveRowsServerSide(context.supabase as unknown as SupabaseLike, context.userId);
    throw new Error(error.message);
  });

/** حارس خادمي إضافي: يمنع الطالب/المُنشئ من التأكيد حتى قبل تطبيق الهجرة. */
async function assertMayConfirm(supabase: SupabaseLike, userId: string, appointmentId: string) {
  const rows = await deriveRowsServerSide(supabase, userId);
  const row = rows.find((r) => r.id === appointmentId);
  if (!row) throw new Error("FORBIDDEN");
  if (!row.can_confirm) throw new Error("CONFIRM_BY_REQUESTER_FORBIDDEN");
}

export const confirmAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMayConfirm(
      context.supabase as unknown as SupabaseLike,
      context.userId,
      data.appointmentId,
    );
    const { error } = await context.supabase.rpc("confirm_appointment", {
      _appointment_id: data.appointmentId,
    });
    if (error) throw new Error(error.message);
    return true;
  });

/**
 * إعادة الجدولة: تحفظ الموعد السابق وتعيد الحالة إلى «بانتظار الموافقة» من الطرف الآخر.
 * لا تُعد تأكيدًا، ولا تُبقي الموعد مؤكدًا.
 */
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        appointmentId: uuid,
        newStartsAtLocal: z
          .string()
          .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/)
          .refine(latinOnly, { message: "NON_LATIN_DIGITS" }),
        reason: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ startsAt: string }> => {
    const rows = await deriveRowsServerSide(
      context.supabase as unknown as SupabaseLike,
      context.userId,
    );
    const row = rows.find((r) => r.id === data.appointmentId);
    if (!row) throw new Error("FORBIDDEN");
    if (!row.can_reschedule) throw new Error("APPOINTMENT_STATE_INVALID");

    const startsAt = new Date(`${data.newStartsAtLocal}:00+03:00`).toISOString();
    if (Number.isNaN(Date.parse(startsAt))) throw new Error("INVALID_DATETIME");
    if (new Date(startsAt).getTime() <= Date.now()) throw new Error("APPOINTMENT_IN_THE_PAST");

    const rpc = (context.supabase as unknown as SupabaseLike).rpc as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("reschedule_appointment", {
      _appointment_id: data.appointmentId,
      _new_starts_at: startsAt,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return { startsAt };
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
        providerNumber: z
          .string()
          .trim()
          .regex(/^[0-9]{10}$/)
          .refine(latinOnly, { message: "NON_LATIN_DIGITS" }),
        kind: z.string().min(2),
        title: z.string().trim().min(3).max(160),
        // "YYYY-MM-DDTHH:mm" بتوقيت الرياض
        startsAtLocal: z
          .string()
          .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/)
          .refine(latinOnly, { message: "NON_LATIN_DIGITS" }),
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

