/**
 * @deprecated Phase 29A moved every formatter to `src/lib/format.ts`.
 * This thin shim stays so older imports keep working; it now delegates to the
 * central layer (Gregorian calendar, Asia/Riyadh, 24h, Latin digits 0-9).
 */
import { formatDateTime } from "@/lib/format";

export function formatRiyadh(iso: string | null | undefined): string {
  return formatDateTime(iso);
}
