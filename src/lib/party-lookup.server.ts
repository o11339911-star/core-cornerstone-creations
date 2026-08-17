/**
 * Server-only identifier resolution for project parties and external member
 * assignments.
 *
 * The raw national ID never leaves this module: persons match on the
 * deterministic HMAC fingerprint, entities on an exact CR / unified number.
 * The client only ever receives `{ status, displayName, last4 }` — never a
 * user id, entity id, cipher, e-mail or fingerprint.
 */

import { isValidSaudiId } from "@/lib/identity-format";
import { allowAttempt } from "@/lib/auth-identity.server";
import { subjectHmac } from "@/lib/subject-hash.server";
import { pickUniqueEntityMatch } from "@/lib/deal-lookup.server";

export type PartyKind = "person" | "entity";

/** Client-safe projection. */
export type PartyLookupResult =
  | { status: "invalid" }
  | { status: "throttled" }
  | { status: "registered"; displayName: string | null; last4: string }
  | { status: "unregistered"; last4: string };

/** Server-only resolution, including the ids used by the RPCs. */
export type ResolvedParty = {
  result: PartyLookupResult;
  fingerprint: string | null;
  last4: string;
  matchedEntityId: string | null;
  matchedUserId: string | null;
  displayName: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(hash: string, outcome: string) {
  try {
    const client = await admin();
    await client
      .from("auth_security_events")
      .insert({ event: "project_party_lookup", subject_hash: hash.slice(0, 32), outcome });
  } catch {
    /* auditing never blocks the flow */
  }
}

const INVALID: ResolvedParty = {
  result: { status: "invalid" },
  fingerprint: null,
  last4: "",
  matchedEntityId: null,
  matchedUserId: null,
  displayName: null,
};

export async function resolvePartyIdentifier(input: {
  partyKind: PartyKind;
  digits: string;
  actorUserId: string;
}): Promise<ResolvedParty> {
  const { partyKind, digits, actorUserId } = input;

  const valid = partyKind === "person" ? isValidSaudiId(digits) : /^[0-9]{10}$/.test(digits);
  if (!valid) return INVALID;

  const last4 = digits.slice(-4);

  let hash: string;
  let fingerprint: string;
  let actorKey: string;
  try {
    hash = subjectHmac(`${partyKind}:${digits}`);
    fingerprint = subjectHmac(`party|${partyKind}|${digits}`);
    actorKey = subjectHmac(`actor|${actorUserId}`).slice(0, 24);
  } catch {
    return INVALID;
  }

  const allowed = await allowAttempt(`party-lookup:${actorKey}`, 30, 600);
  if (!allowed) {
    await audit(hash, "throttled");
    return { ...INVALID, result: { status: "throttled" } };
  }

  const client = await admin();

  if (partyKind === "person") {
    const { identityFingerprint } = await import("@/lib/identity-crypto.server");
    const { data: userId } = await client.rpc("svc_identity_lookup", {
      _fingerprint: identityFingerprint(digits),
    });
    if (!userId) {
      await audit(hash, "unregistered");
      return {
        result: { status: "unregistered", last4 },
        fingerprint,
        last4,
        matchedEntityId: null,
        matchedUserId: null,
        displayName: null,
      };
    }
    const { data: profile } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", userId as string)
      .maybeSingle();
    await audit(hash, "registered");
    const name = profile?.full_name ?? null;
    return {
      result: { status: "registered", displayName: name, last4 },
      fingerprint,
      last4,
      matchedEntityId: null,
      matchedUserId: userId as string,
      displayName: name,
    };
  }

  const { data: rows } = await client
    .from("entity_profiles")
    .select("entity_id, legal_name_ar, legal_name_en")
    .or(`cr_number.eq.${digits},unified_national_number.eq.${digits}`)
    .limit(2);

  const matches = rows ?? [];
  if (matches.length === 0) {
    await audit(hash, "unregistered");
    return {
      result: { status: "unregistered", last4 },
      fingerprint,
      last4,
      matchedEntityId: null,
      matchedUserId: null,
      displayName: null,
    };
  }
  const row = pickUniqueEntityMatch(matches);
  if (!row) {
    await audit(hash, "ambiguous");
    return INVALID;
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
  return {
    result: { status: "registered", displayName: name, last4 },
    fingerprint,
    last4,
    matchedEntityId: row.entity_id,
    matchedUserId: null,
    displayName: name,
  };
}
