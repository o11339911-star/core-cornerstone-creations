/**
 * Phase 25 — official / external integrations.
 *
 * Every potential government or utility integration is described by ONE
 * adapter interface. Only `mock` implementations exist in this codebase:
 * there is no real HTTP client for any authority, and no scraping. Turning an
 * integration `live` is blocked in the database itself.
 */

export type IntegrationCode =
  | "nafath"
  | "rega"
  | "real_estate_registry"
  | "municipality"
  | "electricity"
  | "water";

export type AdapterResult =
  | { ok: true; data: Record<string, string | number | boolean | null>; isMock: true }
  | { ok: false; errorCode: string; errorMessage: string; isMock: true };

export interface IntegrationAdapter {
  code: IntegrationCode;
  operations: readonly string[];
  call(operation: string, input: Record<string, unknown>): Promise<AdapterResult>;
}

/** Marks every payload returned by a mock adapter — never remove this. */
export function mockEnvelope(data: Record<string, string | number | boolean | null>) {
  return { __mock: true, source: "mock", generated_at: new Date().toISOString(), ...data };
}
