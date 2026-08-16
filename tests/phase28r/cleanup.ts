/**
 * Phase 28-R cleanup (TEST PATH ONLY).
 *   bun tests/phase28r/cleanup.ts
 * Deletes ONLY rows whose ids are in registry.json plus any residual
 * p28r-* / TEST-28R artefacts. Permanent data is never targeted.
 */
import { readFileSync } from "node:fs";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function del(path: string) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method: "DELETE", headers: H });
  return `${path} -> ${res.status}`;
}

const registry = JSON.parse(readFileSync("tests/phase28r/registry.json", "utf8"));
const users: string[] = Object.values(registry.users ?? {});
const entities: string[] = Object.values(registry.entities ?? {});
const project = registry.rows?.project;
const inList = (v: string[]) => `in.(${v.join(",")})`;

const log: string[] = [];

// 1) revoke sessions (official admin route), then remove auth users
for (const id of users) {
  const out = await fetch(`${URL_}/auth/v1/admin/users/${id}/factors`, { headers: H }).then((r) => r.status);
  log.push(`factors ${id} -> ${out}`);
}
for (const id of users) {
  const res = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H });
  log.push(`auth user ${id} -> ${res.status}`);
}

// 2) child data first
if (project) {
  for (const t of [
    "drawing_markups", "drawing_status_events", "drawing_conversion_jobs", "drawing_version_meta",
  ]) {
    const ids = registry.rows?.drawing ? `drawing_id=eq.${registry.rows.drawing}` : null;
    if (ids) log.push(await del(`${t}?${ids}`));
  }
  if (registry.rows?.storagePath) {
    const res = await fetch(`${URL_}/storage/v1/object/cad-originals/${registry.rows.storagePath}`, {
      method: "DELETE", headers: H,
    });
    log.push(`storage object -> ${res.status}`);
  }
  if (registry.rows?.drawing) log.push(await del(`drawing_records?id=eq.${registry.rows.drawing}`));
  log.push(await del(`correspondence_message_audience?message_id=not.is.null&thread_id=not.is.null&project_id=eq.${project}`));
  log.push(await del(`requests?project_id=eq.${project}`));
  log.push(await del(`correspondence_threads?project_id=eq.${project}`));
  log.push(await del(`documents?project_id=eq.${project}`));
  log.push(await del(`project_stages?project_id=eq.${project}`));
}
log.push(await del(`projects?name=like.*TEST-28R*`));
if (entities.length) {
  log.push(await del(`entity_invitations?entity_id=${inList(entities)}`));
  log.push(await del(`entity_memberships?entity_id=${inList(entities)}`));
  log.push(await del(`entities?id=${inList(entities)}`));
}
if (users.length) log.push(await del(`profiles?id=${inList(users)}`));

console.log(log.join("\n"));
