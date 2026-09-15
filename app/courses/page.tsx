import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CoursesPanel } from "@/components/CoursesPanel";
import { findGroup } from "@/lib/groups";
import { safeNext } from "@/lib/safe-next";
import { currentTermCode, isTermCode } from "@/lib/sfu";
import { listUserCourses } from "@/lib/user-courses";

/**
 * Which sections you're in — the one question that used to be asked on the
 * busiest page in the app.
 *
 * It lived inside the group page, under a week grid, a member list, a week
 * picker and a duration slider, which put the first thing a new account has to
 * do behind everything they'd do afterwards. Here it is the only thing on the
 * page. Signing up lands here, and `?next=` carries wherever they were
 * actually headed so the step is a stop on the way rather than a detour.
 *
 * `?term=` is for links that know which term they mean — the group page's
 * "Edit courses" is one. `?group=` is for links that only know *which group*:
 * the nav bar has the code in the path and no idea what term it is in, and
 * guessing the current one would quietly file a spring group's sections under
 * fall. The code is resolved here, where there is a database. Everything else
 * gets the current term and a switcher.
 */
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; term?: string; group?: string }>;
}) {
  const [session, { next, term, group }] = await Promise.all([auth(), searchParams]);
  // A group named here is also where you came from, so it is where Continue
  // goes — unless the link said otherwise.
  const from = group ? await findGroup(group.toUpperCase()) : null;
  const to = safeNext(next, from ? `/g/${from.code}` : "/");

  const startTerm = isTermCode(term) ? term : from?.term ?? currentTermCode();

  // A schedule is stored against a user, so there is nowhere to put one until
  // there is a user. Come back here afterwards, carrying the term already
  // resolved rather than the code that resolved it — the round trip shouldn't
  // have to look the group up twice.
  if (!session?.appUserId) {
    const params = new URLSearchParams({ term: startTerm });
    if (to !== "/") params.set("next", to);
    redirect(`/signin?next=${encodeURIComponent(`/courses?${params}`)}`);
  }
  // Read here rather than fetched by the panel: it's the whole content of the
  // page, and a search box above an empty list that fills in a moment later
  // reads as "nothing saved" for exactly long enough to be believed.
  const classNumbers = await listUserCourses(session.appUserId, startTerm);

  return <CoursesPanel startTerm={startTerm} startCourses={classNumbers} next={to} />;
}
