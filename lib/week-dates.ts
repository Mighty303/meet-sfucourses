/**
 * The calendar arithmetic both week views do, in one place.
 *
 * These lived inside the group page until a second week grew its own dates to
 * page through. They are all local-time: a class at 10:30 is 10:30 where the
 * person is, and the app never stores or compares an instant, only a date and a
 * minute-of-day.
 */

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Midday avoids the date shifting under daylight-saving transitions. */
export function parseISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return toISODate(m);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "Sep 18" — for the two ends of the week under the arrows. */
export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * "Thursday, Sep 18" — named in full, because a status is about one specific
 * day and getting the wrong one wrong is silent: you'd mark next week's lecture
 * and wonder why nobody noticed.
 */
export function writeDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
