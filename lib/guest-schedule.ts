// A schedule you haven't got an account for yet, kept in the browser. No
// database import on purpose: this is the client half of having a timetable,
// and lib/user-courses.ts is the half that needs a user to hang one off.

/**
 * Where a guest's sections live until there is an account to move them to.
 *
 * The landing page lets someone type their real courses and see their real
 * week before signing up, which means the sections have to go somewhere and
 * the server is not that somewhere: storing them there would need an anonymous
 * identity, a row nobody owns, and a way to clean both up. localStorage is the
 * whole of the mechanism, and signing up is what moves it — see
 * components/ClaimGuestCourses.tsx.
 *
 * Keyed by term, the same way meetup.user_courses is, so the shape survives
 * being copied across: `{ "2026-fall": ["1234", "5678"] }`.
 */

const KEY = "meetup.guest.courses";

/**
 * Sections per term. A guest week is a demonstration, not a transcript, and
 * nobody is in twelve sections — this is only here so a wedged retry loop
 * can't fill the origin's storage quota.
 */
export const GUEST_MAX = 12;

type Stored = Record<string, string[]>;

/**
 * Every guest term at once. Returns an empty object rather than throwing:
 * Safari's private mode throws on access, and a browser that won't remember a
 * schedule is a browser where the demo simply doesn't persist.
 */
export function allGuestCourses(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Stored = {};
    for (const [term, numbers] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(numbers)) continue;
      const clean = numbers.filter((n): n is string => typeof n === "string");
      if (clean.length > 0) out[term] = clean.slice(0, GUEST_MAX);
    }
    return out;
  } catch {
    return {};
  }
}

/** Ascending, so the chips never reshuffle — listUserCourses orders the same way. */
export function readGuestCourses(term: string): string[] {
  return [...(allGuestCourses()[term] ?? [])].sort();
}

function write(all: Stored): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota or private mode. The in-memory copy the caller holds still draws
    // this session's week; only the reload survives nothing.
  }
}

/** Adding one already there is a no-op, the same as the ON CONFLICT upstream. */
export function addGuestCourse(term: string, classNumber: string): void {
  const all = allGuestCourses();
  const current = all[term] ?? [];
  if (current.includes(classNumber)) return;
  if (current.length >= GUEST_MAX) return;
  all[term] = [...current, classNumber];
  write(all);
}

export function removeGuestCourse(term: string, classNumber: string): void {
  const all = allGuestCourses();
  const next = (all[term] ?? []).filter((n) => n !== classNumber);
  if (next.length > 0) all[term] = next;
  else delete all[term];
  write(all);
}

/** After the sections have been copied onto a real account. */
export function clearGuestCourses(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing was stored in the first place.
  }
}
