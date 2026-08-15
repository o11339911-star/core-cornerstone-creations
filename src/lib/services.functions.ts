import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 13 — utilities, services and meters.
 * Every service record on a property is produced by a request from Phase 12
 * and only becomes permanent after `review_and_link_service`.
 */

export const SERVICE_STATUSES = [
  "draft",
  "requirements",
  "submitted",
  "in_review",
  "info_needed",
  "awaiting_payment",
  "inspection_scheduled",
  "installed",
  "activated",
  "closed",
  "cancelled",
  "rejected",
] as const;
export type ServiceRequestStatus = (typeof SERVICE_STATUSES)[number];

export const listServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("service_catalog")
      .select(
        "code, name_ar, name_en, category, is_metered, allows_unit_level, requires_unit, default_provider_ar, default_provider_en",
      )
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        status: z.enum(SERVICE_STATUSES).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("requests")
      .select(
        "id, request_no, request_type_code, subject, status, property_id, property_unit_id, created_at, service_request_details!inner(service_code, provider_name, external_ref_no, payment_status, appointment_at, meter_no, account_no)",
      )
      .eq("project_id", data.projectId);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getServiceRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("service_request_details")
      .select("*")
      .eq("request_id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listPropertyServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("property_services")
      .select(
        "id, service_code, service_type, status, property_unit_id, provider_name, meter_no, account_no, installed_at, activated_at, source_request_id, reviewed_at, reference_no",
      )
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        serviceCode: z.string().min(2).max(64),
        subject: z.string().min(2).max(200),
        body: z.string().max(4000).optional(),
        propertyId: z.string().uuid(),
        propertyUnitId: z.string().uuid().nullable().optional(),
        providerName: z.string().max(200).nullable().optional(),
        externalRefNo: z.string().max(120).nullable().optional(),
        requirementsNote: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_service_request", {
      _project_id: data.projectId,
      _service_code: data.serviceCode,
      _subject: data.subject,
      _body: data.body ?? "",
      _property_id: data.propertyId,
      ...(data.propertyUnitId ? { _property_unit_id: data.propertyUnitId } : {}),
      ...(data.providerName ? { _provider_name: data.providerName } : {}),
      ...(data.externalRefNo ? { _external_ref_no: data.externalRefNo } : {}),
      ...(data.requirementsNote ? { _requirements_note: data.requirementsNote } : {}),
      _submit: true,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const updateServiceDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        providerName: z.string().max(200).optional(),
        externalRefNo: z.string().max(120).optional(),
        requirementsNote: z.string().max(4000).optional(),
        paymentStatus: z.enum(["not_required", "pending", "paid"]).optional(),
        paymentAmount: z.number().nonnegative().optional(),
        paymentRef: z.string().max(120).optional(),
        appointmentAt: z.string().optional(),
        meterNo: z.string().max(120).optional(),
        accountNo: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_service_request_details", {
      _request_id: data.requestId,
      ...(data.providerName ? { _provider_name: data.providerName } : {}),
      ...(data.externalRefNo ? { _external_ref_no: data.externalRefNo } : {}),
      ...(data.requirementsNote ? { _requirements_note: data.requirementsNote } : {}),
      ...(data.paymentStatus ? { _payment_status: data.paymentStatus } : {}),
      ...(data.paymentAmount !== undefined ? { _payment_amount: data.paymentAmount } : {}),
      ...(data.paymentRef ? { _payment_ref: data.paymentRef } : {}),
      ...(data.appointmentAt ? { _appointment_at: data.appointmentAt } : {}),
      ...(data.meterNo ? { _meter_no: data.meterNo } : {}),
      ...(data.accountNo ? { _account_no: data.accountNo } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const advanceServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        toStatus: z.enum(SERVICE_STATUSES),
        note: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("advance_service_request", {
      _request_id: data.requestId,
      _to_status: data.toStatus,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reviewAndLinkService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("review_and_link_service", {
      _request_id: data.requestId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { serviceId: (id as string | null) ?? null };
  });
