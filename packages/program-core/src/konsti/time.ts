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

const HELSINKI_PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Interpret a datetime-local value as a Helsinki wall clock, independent of device zone. */
export function helsinkiWallClockToMs(local: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  if (
    new Date(target).getUTCFullYear() !== +year ||
    new Date(target).getUTCMonth() !== +month - 1 ||
    new Date(target).getUTCDate() !== +day
  )
    return Number.NaN;

  let candidate = target;
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(
      HELSINKI_PARTS_FMT.formatToParts(candidate).map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      +parts.year,
      +parts.month - 1,
      +parts.day,
      +parts.hour,
      +parts.minute,
    );
    candidate += target - represented;
  }

  // Reject nonexistent local times at the spring DST transition.
  const roundTrip = HELSINKI_PARTS_FMT.formatToParts(candidate);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    roundTrip.find((part) => part.type === type)?.value;
  const matches =
    value("year") === year &&
    value("month") === month &&
    value("day") === day &&
    value("hour") === hour &&
    value("minute") === minute;
  return matches ? candidate : Number.NaN;
}
