/**
 * Day-boundary recheck helpers.
 *
 * Determine whether the once-per-local-day, non-blocking license recheck
 * should fire. The recheck runs on the first extension start of each local
 * calendar day (user timezone), never on an interval.
 */

/** Formats `nowMs` as a local `YYYY-MM-DD` calendar-day key. */
export function localDayKey(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns true when the local calendar day of `nowMs` differs from
 * `lastCheckDay` (including when `lastCheckDay` is null, i.e. never checked).
 */
export function shouldRecheckToday(lastCheckDay: string | null, nowMs: number): boolean {
  return lastCheckDay !== localDayKey(nowMs);
}
