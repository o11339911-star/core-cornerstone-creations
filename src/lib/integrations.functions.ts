import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMockAdapter } from "@/lib/integrations/mock-adapters";

/**
 * Phase 25 — integration registry + adapter/mock layer.
 *
 * Contract: an integration failure NEVER breaks the calling business flow.
 * `runIntegrationCall` always resolves with a status + safe Arabic message.
 */

const jsonSchema = z.custom<Json>(() => true);

export const integrationSchema = z.object({
  id: z.string(),
  code: z.string(),
  provider_name_ar: z.string(),
  provider_name_en: z.string(),
  purpose: z.string(),
  legal_basis: z.string().nullable(),
  agreement_status: z.string(),
  secret_env_names: z.array(z.string()),
  exchanged_fields: jsonSchema,
  rate_limit_per_minute: z.number(),
  retry_policy: jsonSchema,
  webhook_url: z.string().nullable(),
  status: z.string(),
  live_approval_ref: z.string().nullable(),
  failure_threshold: z.number(),
  active: z.boolean(),
  created_at: z.string(),
});
export type IntegrationRow = z.infer<typeof integrationSchema>;

export const integrationRequestSchema = z.object({
  id: z.string(),
  integration_id: z.string(),
  direction: z.string(),
  operation: z.string(),
  idempotency_key: z.string(),
  request_payload: jsonSchema,
  response_payload: jsonSchema.nullable(),
  status: z.string(),
  attempts: z.number(),
  max_attempts: z.number(),
  safe_error: z.string().nullable(),
  created_at: z.string(),
  last_attempt_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
export type IntegrationRequestRow = z.infer<typeof integrationRequestSchema>;

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationRow[]> => {
    const { data, error } = await context.supabase.rpc("list_integrations");
    if (error) throw new Error(error.message);
    return integrationSchema.array().parse(data ?? []);
  });

export const listIntegrationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<IntegrationRequestRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_integration_requests", {
      ...(data.code ? { _code: data.code } : {}),
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return integrationRequestSchema.array().parse(rows ?? []);
  });

export const setIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string(), status: z.enum(["planned", "mock", "sandbox", "live"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_integration_status", {
      _code: data.code,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type CallOutcome = {
  status: "success" | "failed" | "retried";
  replayed: boolean;
  requestId: string | null;
  attempts: number;
  response: Json | null;
  safeMessageAr: string;
};

const SAFE_MESSAGES: Record<string, string> = {
  INTEGRATION_NOT_FOUND: "هذا التكامل غير مسجَّل.",
  INTEGRATION_NOT_AVAILABLE: "هذا التكامل غير مفعَّل حاليًا (لا يوجد اتصال فعلي بالجهة).",
  INTEGRATION_MAX_ATTEMPTS_REACHED: "تعذّر إتمام النداء بعد استنفاد المحاولات، وسُجِّل للمعالجة لاحقًا.",
  MOCK_UPSTREAM_TIMEOUT: "لم تستجب الجهة في الوقت المحدد، وسُجِّل الطلب لإعادة المحاولة.",
  UNSUPPORTED_OPERATION: "هذه العملية غير مدعومة لهذا التكامل.",
  PLATFORM_STAFF_ONLY: "هذه المنطقة مخصصة لفريق تشغيل المنصة.",
};

export const runIntegrationCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string(),
        operation: z.string(),
        idempotencyKey: z.string().min(6).max(200),
        payload: z.record(z.string(), jsonSchema).default({}),
        entityId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CallOutcome> => {
    const begin = await context.supabase.rpc("begin_integration_request", {
      _code: data.code,
      _operation: data.operation,
      _idempotency_key: data.idempotencyKey,
      _payload: data.payload as Json,
      ...(data.entityId ? { _entity_id: data.entityId } : {}),
      ...(data.projectId ? { _project_id: data.projectId } : {}),
    });

    if (begin.error) {
      const code = begin.error.message.trim();
      return {
        status: "failed" as const,
        replayed: false,
        requestId: null,
        attempts: 0,
        response: null,
        safeMessageAr: SAFE_MESSAGES[code] ?? "تعذّر تنفيذ النداء، وسُجِّل الطلب.",
      };
    }

    const started = begin.data as {
      request_id: string;
      replayed: boolean;
      status: string;
      response?: Json;
      safe_error?: string;
    };

    if (started.replayed) {
      return {
        status: started.status as "success" | "failed",
        replayed: true,
        requestId: started.request_id,
        attempts: 0,
        response: started.response ?? null,
        safeMessageAr:
          started.status === "success"
            ? "أُعيدت النتيجة المخزَّنة لنفس مفتاح التفرّد دون نداء جديد."
            : (SAFE_MESSAGES[started.safe_error ?? ""] ?? "الطلب سبق أن فشل نهائيًا."),
      };
    }

    const adapter = getMockAdapter(data.code);
    if (!adapter) {
      const done = await context.supabase.rpc("complete_integration_request", {
        _request_id: started.request_id,
        _ok: false,
        _error: "NO_ADAPTER_IMPLEMENTATION",
      });
      if (done.error) throw new Error(done.error.message);
      return {
        status: "failed" as const,
        replayed: false,
        requestId: started.request_id,
        attempts: 0,
        response: null,
        safeMessageAr: SAFE_MESSAGES["INTEGRATION_NOT_AVAILABLE"]!,
      };
    }

    const result = await adapter.call(data.operation, data.payload);

    const finished = await context.supabase.rpc("complete_integration_request", {
      _request_id: started.request_id,
      _ok: result.ok,
      ...(result.ok ? { _response: result.data as Json } : { _error: result.errorMessage }),
    });
    if (finished.error) throw new Error(finished.error.message);

    const out = finished.data as { status: string; safe_error: string | null; attempts: number };

    return {
      status: out.status as "success" | "failed" | "retried",
      replayed: false,
      requestId: started.request_id,
      attempts: out.attempts,
      response: result.ok ? (result.data as Json) : null,
      safeMessageAr: result.ok
        ? "تم النداء التجريبي بنجاح (بيانات وهمية — لا اتصال فعلي بأي جهة)."
        : (SAFE_MESSAGES[result.errorCode] ?? "تعذّر إتمام النداء، وسُجِّل الطلب لإعادة المحاولة."),
    };
  });
