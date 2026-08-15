import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 23 — 360° photography.
 *
 * Raw captures live in the private `media-360-raw` bucket; only an approved,
 * manually blurred copy is promoted to `media-360-public` (also private, served
 * through short-lived signed URLs). Every write goes through a SECURITY DEFINER
 * RPC — the tables grant SELECT only. `getPublicMedia` is intentionally
 * unauthenticated and returns a uniform `null` for any unknown/revoked token.
 */

const uuid = z.string().uuid();

export const RAW_BUCKET = "media-360-raw";
export const PUBLIC_BUCKET = "media-360-public";

export const mediaShootSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  requested_by: z.string().uuid(),
  photographer_entity_id: z.string().uuid().nullable(),
  photographer_user_id: z.string().uuid().nullable(),
  status: z.string(),
  scheduled_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});
export type MediaShoot = z.infer<typeof mediaShootSchema>;

export const mediaAssetSchema = z.object({
  id: z.string().uuid(),
  shoot_id: z.string().uuid(),
  project_id: z.string().uuid(),
  kind: z.string(),
  title: z.string(),
  raw_object_path: z.string(),
  blurred_object_path: z.string().nullable(),
  blur_ack_at: z.string().nullable(),
  blur_ack_text: z.string().nullable(),
  status: z.string(),
  submitted_at: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  approved_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.string(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mediaPublicationSchema = z.object({
  id: z.string().uuid(),
  asset_id: z.string().uuid(),
  project_id: z.string().uuid(),
  public_token: z.string(),
  published_at: z.string(),
  revoked_at: z.string().nullable(),
  revoke_reason: z.string().nullable(),
});
export type MediaPublication = z.infer<typeof mediaPublicationSchema>;

export const mediaAttendanceSchema = z.object({
  id: z.string().uuid(),
  shoot_id: z.string().uuid(),
  user_id: z.string().uuid(),
  checked_in_at: z.string(),
  lat: z.union([z.number(), z.string()]).nullable(),
  lng: z.union([z.number(), z.string()]).nullable(),
});
export type MediaAttendance = z.infer<typeof mediaAttendanceSchema>;

const SHOOT_COLS =
  "id, project_id, property_id, requested_by, photographer_entity_id, photographer_user_id, status, scheduled_at, notes, created_at";
const ASSET_COLS =
  "id, shoot_id, project_id, kind, title, raw_object_path, blurred_object_path, blur_ack_at, blur_ack_text, status, submitted_at, reviewed_at, approved_at, rejection_reason, created_at";
const PUB_COLS = "id, asset_id, project_id, public_token, published_at, revoked_at, revoke_reason";

/* ------------------------------------------------------------------ reads */

export const listMediaShoots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MediaShoot[]> => {
    const { data: rows, error } = await context.supabase
      .from("media_shoot_requests")
      .select(SHOOT_COLS)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(mediaShootSchema).parse(rows ?? []);
  });

export const listMediaAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MediaAsset[]> => {
    const { data: rows, error } = await context.supabase
      .from("media_assets")
      .select(ASSET_COLS)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(mediaAssetSchema).parse(rows ?? []);
  });

export const listMediaPublications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MediaPublication[]> => {
    const { data: rows, error } = await context.supabase
      .from("media_publications")
      .select(PUB_COLS)
      .eq("project_id", data.projectId)
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(mediaPublicationSchema).parse(rows ?? []);
  });

export const listMediaAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shootId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MediaAttendance[]> => {
    const { data: rows, error } = await context.supabase
      .from("media_shoot_attendance")
      .select("id, shoot_id, user_id, checked_in_at, lat, lng")
      .eq("shoot_id", data.shootId)
      .order("checked_in_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(mediaAttendanceSchema).parse(rows ?? []);
  });

/* ----------------------------------------------------------------- writes */

export const requestMediaShoot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        propertyId: uuid.nullable().default(null),
        scheduledAt: z.string().nullable().default(null),
        notes: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("request_media_shoot", {
      _project_id: data.projectId,
      ...(data.propertyId ? { _property_id: data.propertyId } : {}),
      ...(data.scheduledAt ? { _scheduled_at: data.scheduledAt } : {}),
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const assignMediaPhotographer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shootId: uuid,
        photographerEntityId: uuid.nullable().default(null),
        photographerUserId: uuid.nullable().default(null),
        scheduledAt: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("assign_media_photographer", {
      _shoot_id: data.shootId,
      ...(data.photographerEntityId ? { _photographer_entity_id: data.photographerEntityId } : {}),
      ...(data.photographerUserId ? { _photographer_user_id: data.photographerUserId } : {}),
      ...(data.scheduledAt ? { _scheduled_at: data.scheduledAt } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const checkInMediaShoot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shootId: uuid,
        lat: z.number().nullable().default(null),
        lng: z.number().nullable().default(null),
        accuracyM: z.number().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("check_in_media_shoot", {
      _shoot_id: data.shootId,
      ...(data.lat !== null ? { _lat: data.lat } : {}),
      ...(data.lng !== null ? { _lng: data.lng } : {}),
      ...(data.accuracyM !== null ? { _accuracy_m: data.accuracyM } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  });

/** Short-lived upload target inside the raw bucket, scoped to the project folder. */
export const createMediaUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        shootId: uuid,
        fileName: z.string().min(1).max(160),
        blurred: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: canError } = await context.supabase
      .from("media_shoot_requests")
      .select("id")
      .eq("id", data.shootId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (canError) throw new Error(canError.message);
    if (!allowed) throw new Error("Forbidden");

    const safe = data.fileName.replace(/[^\w.-]+/g, "_").slice(-120);
    const path = `${data.projectId}/${data.shootId}/${data.blurred ? "blurred" : "raw"}-${Date.now()}-${safe}`;
    const signed = await context.supabase.storage.from(RAW_BUCKET).createSignedUploadUrl(path);
    if (signed.error) throw new Error(signed.error.message);
    return { path, token: signed.data.token, bucket: RAW_BUCKET };
  });

export const registerMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shootId: uuid,
        title: z.string().min(2).max(200),
        rawObjectPath: z.string().min(3).max(400),
        kind: z.enum(["panorama_360", "photo", "video"]).default("panorama_360"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("register_media_asset", {
      _shoot_id: data.shootId,
      _title: data.title,
      _raw_object_path: data.rawObjectPath,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const attachBlurredMediaVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assetId: uuid,
        objectPath: z.string().min(3).max(400),
        ackText: z.string().min(10).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("attach_blurred_media_version", {
      _asset_id: data.assetId,
      _object_path: data.objectPath,
      _ack_text: data.ackText,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const submitMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assetId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_media_asset", { _asset_id: data.assetId });
    if (error) throw new Error(error.message);
    return true;
  });

export const reviewMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assetId: uuid,
        approve: z.boolean(),
        reason: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_media_asset", {
      _asset_id: data.assetId,
      _approve: data.approve,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const approveMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assetId: uuid,
        approve: z.boolean(),
        reason: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_media_asset", {
      _asset_id: data.assetId,
      _approve: data.approve,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const withdrawMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assetId: uuid, reason: z.string().min(5).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("withdraw_media_asset", {
      _asset_id: data.assetId,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return true;
  });

/** Publishes the blurred copy only, after the DB confirms owner approval. */
export const publishMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assetId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const { data: asset, error } = await context.supabase
      .from("media_assets")
      .select("id, project_id, status, blurred_object_path")
      .eq("id", data.assetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset) throw new Error("Asset not found");
    if (asset.status !== "owner_approved") throw new Error("NOT_APPROVED");
    if (!asset.blurred_object_path) throw new Error("BLUR_REQUIRED");

    const publicPath = `${asset.project_id}/${asset.id}/${Date.now()}.bin`;
    const { data: token, error: rpcError } = await context.supabase.rpc("publish_media_asset", {
      _asset_id: data.assetId,
      _public_object_path: publicPath,
    });
    if (rpcError) throw new Error(rpcError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const download = await supabaseAdmin.storage.from(RAW_BUCKET).download(asset.blurred_object_path);
    if (download.error) throw new Error(download.error.message);
    const upload = await supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .upload(publicPath, download.data, { upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    return { token: token as string };
  });

export const revokeMediaPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ publicationId: uuid, reason: z.string().min(5).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revoke_media_publication", {
      _publication_id: data.publicationId,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return true;
  });

/** Internal signed URL for reviewers (60s, server-fixed). */
export const getMediaObjectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assetId: uuid, variant: z.enum(["raw", "blurred"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: asset, error } = await context.supabase
      .from("media_assets")
      .select("raw_object_path, blurred_object_path")
      .eq("id", data.assetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset) throw new Error("Asset not found");
    const path = data.variant === "raw" ? asset.raw_object_path : asset.blurred_object_path;
    if (!path) throw new Error("Object not available");
    const signed = await context.supabase.storage.from(RAW_BUCKET).createSignedUrl(path, 60);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, expiresInSeconds: 60 };
  });

/* --------------------------------------------------------- public viewer */

export const publicMediaSchema = z.object({
  title: z.string(),
  kind: z.string(),
  published_at: z.string(),
});
export type PublicMedia = z.infer<typeof publicMediaSchema>;

export const getPublicMedia = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(input))
  .handler(async ({ data }): Promise<(PublicMedia & { url: string }) | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Supabase is not configured");
    const anon = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: row, error } = await anon.rpc("get_public_media", { _token: data.token });
    if (error) throw new Error(error.message);
    if (!row) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: objectPath, error: resolveError } = await supabaseAdmin.rpc(
      "resolve_public_media_object",
      { _token: data.token },
    );
    if (resolveError) throw new Error(resolveError.message);
    if (!objectPath) return null;
    const signed = await supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .createSignedUrl(objectPath as string, 300);
    if (signed.error) throw new Error(signed.error.message);
    return { ...publicMediaSchema.parse(row), url: signed.data.signedUrl };
  });
