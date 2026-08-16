import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 19 — unified search and the aggregated project overview.
 *
 * This layer owns no data of its own: every field is read live from the
 * table that already owns it, through read-only database functions that
 * re-derive the caller's access with `private.can_access_project` /
 * `private.can_view_project_finance` at call time.
 *
 * The `finance` key is ABSENT from the payload for callers without finance
 * visibility — it is never nulled out client-side.
 */

export const searchResultSchema = z.object({
  project_id: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  status: z.string(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  match_field: z.string(),
});
export type ProjectSearchResult = z.infer<typeof searchResultSchema>;

export const completionSchema = z.object({
  stages_total: z.number(),
  stages_done: z.number(),
  closure_total: z.number(),
  closure_done: z.number(),
  percent: z.number(),
});
export type ProjectCompletion = z.infer<typeof completionSchema>;

// JSON payloads returned by the aggregation functions are plain serializable
// records; the shape of each section is documented by its SQL builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonRecord = z.record(z.string(), z.any());


export const overviewSchema = z.object({
  basics: jsonRecord,
  location: jsonRecord,
  ownership: z.array(jsonRecord),
  deed: jsonRecord.nullable(),
  license: jsonRecord.nullable(),
  parties: z.array(jsonRecord),
  supervisors: z.array(jsonRecord),
  documents: z.record(z.string(), z.number()),
  stages: z.array(jsonRecord),
  requests: z.array(jsonRecord),
  services: z.array(jsonRecord),
  completion: completionSchema.nullable(),
  /** Optional by design: absent for callers without finance visibility. */
  finance: z
    .object({
      contracts: z.array(jsonRecord),
      milestones: z.array(jsonRecord),
    })
    .optional(),
});
export type ProjectOverview = z.infer<typeof overviewSchema>;

/** Unified search: project number/name/district, parcel, plan, deed, licence. */
export const searchProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().max(120), limit: z.number().int().min(1).max(50).optional() }).parse(
      input,
    ),
  )
  .handler(async ({ data, context }): Promise<ProjectSearchResult[]> => {
    if (data.q.trim().length < 2) return [];
    const { data: rows, error } = await context.supabase.rpc("search_projects", {
      _q: data.q.trim(),
      _limit: data.limit ?? 20,
    });
    if (error) throw new Error(error.message);
    return searchResultSchema.array().parse(rows ?? []);
  });

/** Aggregated project summary, or null when the caller has no access. */
export const getProjectOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectOverview | null> => {
    const { data: row, error } = await context.supabase.rpc("get_project_overview", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    if (!row) return null;
    return overviewSchema.parse(row);
  });

/** Live completion, recomputed on every call from stages + closure items. */
export const getProjectCompletion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectCompletion | null> => {
    const { data: row, error } = await context.supabase.rpc("project_completion", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    if (!row) return null;
    return completionSchema.parse(row);
  });

/* ------------------------- dashboard project list ------------------------ */

export const projectListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  status: z.string(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  template_name: z.string().nullable(),
  property_name: z.string().nullable(),
});
export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export type ProjectListPage = { items: ProjectListItem[]; total: number };

const escapeLike = (value: string) => value.replace(/[%_,()]/g, " ").trim();

/**
 * Projects visible to the caller in the ACTIVE scope only.
 *
 * Scope is enforced twice: an explicit `entity_id` filter here (personal scope
 * means `entity_id is null` + owner is the caller) and RLS in the database,
 * which remains the source of truth. The search term is an optional filter —
 * an empty term returns the most recent projects.
 */
export const listMyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid().nullable().optional(),
        q: z.string().max(120).optional(),
        page: z.number().int().min(1).max(200).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ProjectListPage> => {
    const pageSize = data.pageSize ?? 10;
    const page = data.page ?? 1;
    const from = (page - 1) * pageSize;

    let query = context.supabase
      .from("projects")
      .select(
        "id, name, code, status, city, district, created_at, project_templates(name), property_projects(properties(name))",
        { count: "exact" },
      )
      .is("deleted_at", null);

    if (data.entityId) {
      query = query.eq("entity_id", data.entityId);
    } else {
      query = query.is("entity_id", null).eq("owner_id", context.userId);
    }

    const term = escapeLike(data.q ?? "");
    if (term) {
      query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
    }

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const items = (rows ?? []).map((row) => {
      const r = row as unknown as {
        id: string;
        name: string;
        code: string | null;
        status: string;
        city: string | null;
        district: string | null;
        project_templates: { name: string } | { name: string }[] | null;
        property_projects: { properties: { name: string } | { name: string }[] | null }[] | null;
      };
      const template = Array.isArray(r.project_templates)
        ? (r.project_templates[0] ?? null)
        : r.project_templates;
      const firstLink = r.property_projects?.[0]?.properties ?? null;
      const property = Array.isArray(firstLink) ? (firstLink[0] ?? null) : firstLink;
      return projectListItemSchema.parse({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        city: r.city,
        district: r.district,
        template_name: template?.name ?? null,
        property_name: property?.name ?? null,
      });
    });

    return { items, total: count ?? items.length };
  });
