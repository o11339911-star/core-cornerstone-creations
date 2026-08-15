import { mockEnvelope, type AdapterResult, type IntegrationAdapter, type IntegrationCode } from "./types";

/**
 * Mock implementations only. Each returns clearly-labelled fake data
 * (`__mock: true`, values prefixed with `MOCK-`). No network call is made.
 *
 * A caller can force a failure for acceptance testing by passing
 * `{ __simulate_failure: true }` in the input.
 */

function fail(code: string, message: string): AdapterResult {
  return { ok: false, errorCode: code, errorMessage: message, isMock: true };
}

function ok(data: Record<string, string | number | boolean | null>): AdapterResult {
  return { ok: true, data: mockEnvelope(data), isMock: true };
}

function suffix(input: Record<string, unknown>) {
  const raw = Object.values(input).find((v) => typeof v === "string") as string | undefined;
  return (raw ?? "000000").toString().slice(-6).toUpperCase();
}

const IMPLEMENTATIONS: Record<
  IntegrationCode,
  { operations: readonly string[]; run: (op: string, input: Record<string, unknown>) => Record<string, string | number | boolean | null> }
> = {
  nafath: {
    operations: ["verify_identity"],
    run: (_op, input) => ({
      verification_status: "MOCK-VERIFIED",
      reference: `MOCK-NAFATH-${suffix(input)}`,
      full_name_ar: "مستخدم تجريبي (بيانات وهمية)",
    }),
  },
  rega: {
    operations: ["check_license"],
    run: (_op, input) => ({
      license_status: "MOCK-ACTIVE",
      license_number: `MOCK-REGA-${suffix(input)}`,
      expires_on: "2027-01-01",
    }),
  },
  real_estate_registry: {
    operations: ["lookup_deed"],
    run: (_op, input) => ({
      deed_number: `MOCK-DEED-${suffix(input)}`,
      owner_match: "MOCK-MATCH",
      area_sqm: 420,
    }),
  },
  municipality: {
    operations: ["check_building_license"],
    run: (_op, input) => ({
      license_state: "MOCK-VALID",
      building_license_number: `MOCK-BL-${suffix(input)}`,
    }),
  },
  electricity: {
    operations: ["connection_status"],
    run: (_op, input) => ({
      connection_status: "MOCK-IN_PROGRESS",
      meter_request_id: `MOCK-SEC-${suffix(input)}`,
    }),
  },
  water: {
    operations: ["connection_status"],
    run: (_op, input) => ({
      connection_status: "MOCK-SCHEDULED",
      connection_request_id: `MOCK-NWC-${suffix(input)}`,
    }),
  },
};

export function getMockAdapter(code: string): IntegrationAdapter | null {
  const impl = IMPLEMENTATIONS[code as IntegrationCode];
  if (!impl) return null;
  return {
    code: code as IntegrationCode,
    operations: impl.operations,
    async call(operation, input) {
      if (input["__simulate_failure"]) {
        // Deliberately carries a fake token so `sanitize_error` is exercised.
        return fail(
          "MOCK_UPSTREAM_TIMEOUT",
          `mock upstream timeout while calling ${code}.${operation}`,
        );
      }
      if (!impl.operations.includes(operation)) {
        return fail("UNSUPPORTED_OPERATION", `operation ${operation} is not supported by ${code}`);
      }
      return ok(impl.run(operation, input));
    },
  };
}
