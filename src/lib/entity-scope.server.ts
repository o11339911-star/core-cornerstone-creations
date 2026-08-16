/**
 * Server-side scope verification.
 *
 * The client may send an `entityId`, but it is never trusted: we re-read the
 * caller's own active membership and the entity's real `type` from the
 * database before allowing a scoped registry read or write.
 */
type MinimalSupabase = {
  from: (table: string) => any;
};

export class ScopeForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeForbiddenError";
  }
}

export async function requireEntityOfType(
  supabase: MinimalSupabase,
  userId: string,
  entityId: string,
  allowedTypes: readonly string[],
): Promise<{ entityId: string; type: string; role: string }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("entity_memberships")
    .select("role, status, expires_at, entity:entities!inner(id, type, status, deleted_at)")
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (error) throw error;

  const entity = (data as { entity?: { id: string; type: string; status: string; deleted_at: string | null } } | null)
    ?.entity;

  if (!data || !entity || entity.status !== "active" || entity.deleted_at) {
    throw new ScopeForbiddenError("لا تملك عضوية فعّالة في هذا الكيان.");
  }

  if (!allowedTypes.includes(entity.type)) {
    throw new ScopeForbiddenError("هذه الوحدة متاحة لكيانات المطوّر العقاري فقط.");
  }

  return { entityId: entity.id, type: entity.type, role: (data as { role: string }).role };
}
