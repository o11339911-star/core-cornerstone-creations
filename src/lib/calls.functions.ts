import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireEntityMembership } from "@/lib/entity-scope.server";

/**
 * Internal voice calling (audio only, browser to browser).
 *
 * A call always originates from a confirmed appointment between two entities.
 * The caller must be an active member of the calling entity and the active
 * account must match it; the other side of the appointment is the callee.
 * Only metadata is persisted: parties, status and timings. No audio, no phone
 * numbers, no signalling payload is ever logged.
 */

const uuid = z.string().uuid();

export type CallParty = { entityId: string; name: string };

export type CallSession = {
  id: string;
  appointment_id: string;
  caller_entity_id: string;
  callee_entity_id: string;
  status: string;
  started_at: string;
  accepted_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  caller_name: string;
  callee_name: string;
  appointment_title: string;
  role: "caller" | "callee";
};

export type CallableAppointment = {
  appointment_id: string;
  title: string;
  starts_at: string;
  my_entity_id: string;
  other_entity_id: string;
  other_name: string;
};

const SESSION_COLS =
  "id, appointment_id, caller_entity_id, callee_entity_id, status, started_at, accepted_at, ended_at, duration_seconds, caller:entities!call_sessions_caller_entity_id_fkey(name), callee:entities!call_sessions_callee_entity_id_fkey(name), appointment:appointments!call_sessions_appointment_id_fkey(title)";

type RawSession = {
  id: string;
  appointment_id: string;
  caller_entity_id: string;
  callee_entity_id: string;
  status: string;
  started_at: string;
  accepted_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  caller: { name: string } | null;
  callee: { name: string } | null;
  appointment: { title: string } | null;
};

function shapeSession(row: RawSession, myEntityId: string | null): CallSession {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    caller_entity_id: row.caller_entity_id,
    callee_entity_id: row.callee_entity_id,
    status: row.status,
    started_at: row.started_at,
    accepted_at: row.accepted_at,
    ended_at: row.ended_at,
    duration_seconds: row.duration_seconds,
    caller_name: row.caller?.name ?? "",
    callee_name: row.callee?.name ?? "",
    appointment_title: row.appointment?.title ?? "",
    role: row.caller_entity_id === myEntityId ? "caller" : "callee",
  };
}

export const getCallCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: uuid.nullable().default(null) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.entityId) {
      return { scoped: false, incoming: [], callable: [], history: [] } as {
        scoped: boolean;
        incoming: CallSession[];
        callable: CallableAppointment[];
        history: CallSession[];
      };
    }

    const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);
    const entityId = me.entityId;

    const [{ data: sessions, error: sessionError }, { data: appts, error: apptError }] =
      await Promise.all([
        context.supabase
          .from("call_sessions")
          .select(SESSION_COLS)
          .or(`caller_entity_id.eq.${entityId},callee_entity_id.eq.${entityId}`)
          .order("started_at", { ascending: false })
          .limit(50),
        context.supabase
          .from("appointments")
          .select("id, title, starts_at, requester_entity_id, provider_entity_id")
          .eq("status", "confirmed")
          .or(`requester_entity_id.eq.${entityId},provider_entity_id.eq.${entityId}`)
          .order("starts_at", { ascending: true })
          .limit(50),
      ]);

    if (sessionError) throw new Error(sessionError.message);
    if (apptError) throw new Error(apptError.message);

    const rows = ((sessions ?? []) as unknown as RawSession[]).map((r) => shapeSession(r, entityId));
    const cutoff = Date.now() - 60_000;

    const otherIds = Array.from(
      new Set(
        (appts ?? []).map((a) =>
          a.requester_entity_id === entityId ? a.provider_entity_id : a.requester_entity_id,
        ),
      ),
    );

    const names = new Map<string, string>();
    if (otherIds.length) {
      const { data: ents } = await context.supabase
        .from("entities")
        .select("id, name")
        .in("id", otherIds);
      for (const e of ents ?? []) names.set(e.id as string, e.name as string);
    }

    const callable: CallableAppointment[] = (appts ?? []).map((a) => {
      const other =
        a.requester_entity_id === entityId ? a.provider_entity_id : a.requester_entity_id;
      return {
        appointment_id: a.id as string,
        title: a.title as string,
        starts_at: a.starts_at as string,
        my_entity_id: entityId,
        other_entity_id: other as string,
        other_name: names.get(other as string) ?? "",
      };
    });

    // A ringing session older than 60s is a missed call: reap it server-side so
    // the callee never sees a stale banner and the caller sees the real outcome.
    const stale = rows.filter((r) => r.status === "ringing" && Date.parse(r.started_at) <= cutoff);
    if (stale.length) {
      await Promise.all(
        stale.map((r) =>
          context.supabase
            .from("call_sessions")
            .update({ status: "missed", end_reason: "missed" })
            .eq("id", r.id)
            .eq("status", "ringing"),
        ),
      );
      for (const r of stale) {
        r.status = "missed";
      }
    }

    return {
      scoped: true,
      incoming: rows.filter(
        (r) =>
          r.status === "ringing" &&
          r.callee_entity_id === entityId &&
          Date.parse(r.started_at) > cutoff,
      ),
      callable,
      history: rows.filter((r) => r.status !== "ringing").slice(0, 25),
    };
  });


export const startCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ appointmentId: uuid, entityId: uuid }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ callId: string }> => {
    const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);

    const { data: appt, error: apptError } = await context.supabase
      .from("appointments")
      .select("id, status, requester_entity_id, provider_entity_id")
      .eq("id", data.appointmentId)
      .maybeSingle();

    if (apptError) throw new Error(apptError.message);
    if (!appt) throw new Error("الموعد غير متاح.");
    if (appt.status !== "confirmed") throw new Error("الاتصال متاح للمواعيد المؤكدة فقط.");

    const isRequester = appt.requester_entity_id === me.entityId;
    const isProvider = appt.provider_entity_id === me.entityId;
    if (!isRequester && !isProvider) throw new Error("حسابك النشط ليس طرفًا في هذا الموعد.");

    const callee = isRequester ? appt.provider_entity_id : appt.requester_entity_id;

    const { data: row, error } = await context.supabase
      .from("call_sessions")
      .insert({
        appointment_id: data.appointmentId,
        caller_entity_id: me.entityId,
        callee_entity_id: callee as string,
        caller_user_id: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { callId: row.id as string };
  });

export const respondToCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ callId: uuid, entityId: uuid, accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);

    // `.select()` makes the write verifiable: an empty result means the row was
    // already answered, cancelled or reaped, so we never report a false success.
    const { data: updated, error } = await context.supabase
      .from("call_sessions")
      .update({ status: data.accept ? "accepted" : "declined" })
      .eq("id", data.callId)
      .eq("callee_entity_id", me.entityId)
      .eq("status", "ringing")
      .select("id, status");

    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("المكالمة لم تعد متاحة.");
    return { ok: true, status: (updated[0] as { status: string }).status };
  });


export const endCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        callId: uuid,
        entityId: uuid,
        reason: z.enum(["hangup", "missed", "failed"]).default("hangup"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);

    const { data: row, error: readError } = await context.supabase
      .from("call_sessions")
      .select("id, status, caller_entity_id, callee_entity_id")
      .eq("id", data.callId)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("الجلسة غير متاحة.");
    if (row.caller_entity_id !== me.entityId && row.callee_entity_id !== me.entityId) {
      throw new Error("لست طرفًا في هذه المكالمة.");
    }
    if (row.status === "ended" || row.status === "declined" || row.status === "missed") {
      return { ok: true };
    }

    const nextStatus =
      row.status === "ringing" && data.reason === "missed" ? "missed" : "ended";

    const { error } = await context.supabase
      .from("call_sessions")
      .update({ status: nextStatus, end_reason: data.reason })
      .eq("id", data.callId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCallSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: uuid, entityId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<CallSession | null> => {
    const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);

    const { data: row, error } = await context.supabase
      .from("call_sessions")
      .select(SESSION_COLS)
      .eq("id", data.callId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;
    return shapeSession(row as unknown as RawSession, me.entityId);
  });
