import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CoursesPanel } from "@/components/CoursesPanel";
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
 * "Edit courses" is one. Everything else gets the current one and a switcher.
 */
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; term?: string }>;
}) {
  const [session, { next, term }] = await Promise.all([auth(), searchParams]);
  const to = safeNext(next);

  // A schedule is stored against a user, so there is nowhere to put one until
  // there is a user. Come back here afterwards, still carrying `next`.
  if (!session?.appUserId) {
    const here = to === "/" ? "/courses" : `/courses?next=${encodeURIComponent(to)}`;
    redirect(`/signin?next=${encodeURIComponent(here)}`);
  }

  const startTerm = isTermCode(term) ? term : currentTermCode();
  // Read here rather than fetched by the panel: it's the whole content of the
  // page, and a search box above an empty list that fills in a moment later
  // reads as "nothing saved" for exactly long enough to be believed.
  const classNumbers = await listUserCourses(session.appUserId, startTerm);

  return <CoursesPanel startTerm={startTerm} startCourses={classNumbers} next={to} />;
}
