import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthButton } from "@/components/AuthButton";
import { SoloWeek } from "@/components/SoloWeek";
import { listMembershipsForUser } from "@/lib/groups";
import { currentTermCode } from "@/lib/sfu";
import { listUserCourseTerms } from "@/lib/user-courses";

/**
 * Your own week.
 *
 * In a group, this is that group's page narrowed to your row, so the redirect
 * stands: the grid there already knows how to draw one person, and keeping the
 * group in the URL is what lets the switcher and the invite link stay a click
 * away.
 *
 * Without a group it used to be a paragraph telling you to go and join one.
 * That answer stopped making sense when /courses started saving a schedule
 * before there was anything to join — so a schedule with no group now draws
 * itself, from meetup.user_courses, with no roster around it.
 */
export default async function MySchedulePage() {
  const session = await auth();

  if (!session?.appUserId) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-neutral-500">Sign in to see your saved schedule.</p>
        <div><AuthButton /></div>
      </main>
    );
  }

  const [memberships, terms] = await Promise.all([
    listMembershipsForUser(session.appUserId),
    listUserCourseTerms(session.appUserId),
  ]);
  const latest = memberships[0];
  if (latest) redirect(`/g/${latest.group.code}?view=mine`);

  // No group, but something saved: draw it. The current term when there's a
  // schedule for it, otherwise the newest term there is one for — landing on an
  // empty fall grid while a full spring one sits behind a dropdown is the one
  // outcome that would make the page look broken.
  const saved = terms.map((t) => t.term);
  if (saved.length > 0) {
    const current = currentTermCode();
    return <SoloWeek startTerm={saved.includes(current) ? current : saved[0]} terms={saved} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      <p className="text-sm text-neutral-500">
        Nothing saved yet. Add the sections you&apos;re in and your week appears
        here, with or without a group. If your schedule is already in someone
        else&apos;s group, open its link and claim your name.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/courses"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          Add your courses
        </Link>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          Create or join a group
        </Link>
      </div>
    </main>
  );
}
