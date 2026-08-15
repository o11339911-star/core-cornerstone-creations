import { formatMoney } from "@/lib/format";

/** Shared amount formatter. `null` means the caller has no finance.view. */
export function money(
  value: number | null,
  currency: string | null,
  maskedLabel: string,
): string {
  if (value === null || value === undefined) return maskedLabel;
  return formatMoney(value, currency);
}
