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

const jsonRecord = z.record(z.string(), z.unknown());

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
