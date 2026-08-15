/**
 * All timestamps are stored in UTC (timestamptz). Everything the user sees is
 * rendered in Asia/Riyadh — a single formatter so no screen drifts.
 */
const RIYADH = "Asia/Riyadh";

export function formatRiyadh(iso: string | null | undefined, locale: string = "ar-SA-u-ca-gregory") {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone: RIYADH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
