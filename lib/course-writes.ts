import {
  GUEST_MAX,
  addGuestCourse,
  readGuestCourses,
  removeGuestCourse,
} from "./guest-schedule";

/**
 * Where an add or remove is written.
 *
 * A member row was only ever a route to the user's schedule for the term — the
 * group-scoped endpoint joins members to groups purely to learn which term to
 * file the section under. "me" is that same write with no group to travel
 * through, which is what lets the picker exist before you're in one.
 *
 * "member" is kept because an ownerless member row still has courses of its
 * own, and those have no user to hang off. "guest" is the same write with no
 * *account* to travel through — the landing page's picker, whose sections live
 * in localStorage until signing up moves them. This type is the whole of what
 * CoursePicker knows about any of it.
 */
export type CourseTarget =
  | { via: "member"; groupCode: string; memberId: number }
  | { via: "me" }
  | { via: "guest" };

/**
 * The two endpoints answer with the same shape, so only the URL differs — the
 * group-scoped one carries the term implicitly in the member row, and the
 * user-scoped one has to be told which term it is editing.
 */
function endpointFor(target: Exclude<CourseTarget, { via: "guest" }>): string {
  return target.via === "me"
    ? "/api/me/courses"
    : `/api/groups/${target.groupCode}/members/${target.memberId}/courses`;
}

/**
 * Null on success, the server's message otherwise.
 *
 * Here rather than inside CoursePicker because the picker stopped being the
 * only thing that writes: /courses removes a section from the card beside its
 * week grid, and two copies of "which URL, and does the body carry the term"
 * is exactly the pair that drifts apart.
 */
export async function addCourse(
  target: CourseTarget,
  term: string,
  classNumber: string
): Promise<string | null> {
  if (target.via === "guest") {
    if (readGuestCourses(term).length >= GUEST_MAX) {
      return `that's ${GUEST_MAX} sections — sign in to save a longer schedule`;
    }
    addGuestCourse(term, classNumber);
    return null;
  }

  const res = await fetch(endpointFor(target), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target.via === "me" ? { term, classNumber } : { classNumber }),
  });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? "could not add that section";
}

/** The term rides in the query string here — see the DELETE handler for why. */
export async function removeCourse(
  target: CourseTarget,
  term: string,
  classNumber: string
): Promise<string | null> {
  if (target.via === "guest") {
    removeGuestCourse(term, classNumber);
    return null;
  }

  const params = new URLSearchParams({ classNumber });
  if (target.via === "me") params.set("term", term);
  const res = await fetch(`${endpointFor(target)}?${params}`, { method: "DELETE" });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? "could not remove that section";
}
