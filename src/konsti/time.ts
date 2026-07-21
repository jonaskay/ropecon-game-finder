/**
 * Shared Europe/Helsinki day logic (primer §Tooling; handoff Step 3).
 *
 * Konsti timestamps are UTC instants (ISO-8601 ending in "Z"). The convention day a
 * session belongs to is its Europe/Helsinki calendar day, computed via `Intl` from the
 * UTC instant — never by hand-rolling a +3h offset (which breaks across DST edges).
 *
 * This lives here, not privately in the audit, so the audit enumeration and the
 * normaliser derive `day` identically.
 */

const HELSINKI_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Europe/Helsinki calendar day (YYYY-MM-DD) for a UTC instant, or null if unparseable. */
export function helsinkiDay(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return HELSINKI_DAY_FMT.format(instant);
}
