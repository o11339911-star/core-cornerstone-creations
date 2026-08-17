/**
 * Server-only counterparty lookup for the "new contracting deal" form.
 *
 * The raw national ID / CR number never leaves this module: the person branch
 * matches on the deterministic HMAC fingerprint, the entity branch matches on
 * an exact CR number. The answer is limited to "registered / not registered"
 * plus the publicly displayable legal name — never an e-mail, user id or
 * entity id (the real link is re-resolved inside `create_contracting_deal`).
 */

import { isValidSaudiId } from "@/lib/identity-format";
import { allowAttempt } from "@/lib/auth-identity.server";
import { subjectHmac } from "@/lib/subject-hash.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(hash: string, outcome: string) {
  try {
    const client = await admin();
    await client
      .from("auth_security_events")
      .insert({ event: "deal_counterparty_lookup", subject_hash: hash.slice(0, 32), outcome });
  } catch {
    /* auditing never blocks the flow */
  }
}

export type CounterpartyLookup =
  | { status: "invalid" }
  | { status: "throttled" }
  | { status: "registered"; displayName: string | null }
  | { status: "unregistered" };

export async function lookupDealCounterparty(input: {
  partyKind: "person" | "entity";
  digits: string;
  actorUserId: string;
}): Promise<CounterpartyLookup> {
  const { partyKind, digits, actorUserId } = input;

  const valid = partyKind === "person" ? isValidSaudiId(digits) : /^[0-9]{10}$/.test(digits);
  if (!valid) return { status: "invalid" };

  // Per-actor budget stops bulk enumeration regardless of the number tried.
  const allowed = await allowAttempt(`deal-lookup:${actorUserId}`, 30, 600);
  let hash: string;
  try {
    hash = subjectHmac(`${partyKind}:${digits}`);
  } catch {
    // Missing server key: fail internally with a neutral answer.
    return { status: "invalid" };
  }
  if (!allowed) {
    await audit(hash, "throttled");
    return { status: "throttled" };
  }

  const client = await admin();

  if (partyKind === "person") {
    const { identityFingerprint } = await import("@/lib/identity-crypto.server");
    const { data: userId } = await client.rpc("svc_identity_lookup", {
      _fingerprint: identityFingerprint(digits),
    });
    if (!userId) {
      await audit(hash, "unregistered");
      return { status: "unregistered" };
    }
    const { data: profile } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", userId as string)
      .maybeSingle();
    await audit(hash, "registered");
    return { status: "registered", displayName: profile?.full_name ?? null };
  }

  const { data: row } = await client
    .from("entity_profiles")
    .select("entity_id, legal_name_ar, legal_name_en")
    .eq("cr_number", digits)
    .maybeSingle();

  if (!row) {
    await audit(hash, "unregistered");
    return { status: "unregistered" };
  }

  let name = row.legal_name_ar ?? row.legal_name_en ?? null;
  if (!name) {
    const { data: entity } = await client
      .from("entities")
      .select("name")
      .eq("id", row.entity_id)
      .maybeSingle();
    name = entity?.name ?? null;
  }

  await audit(hash, "registered");
  return { status: "registered", displayName: name };
}
