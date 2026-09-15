import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { safeNext } from "@/lib/safe-next";

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
 *
 * A new account doesn't go straight there, though: it goes to /courses first,
 * with `next` nested inside so the eventual destination survives the stop. The
 * account is worth nothing until it has a schedule attached, and the page that
 * used to be the place to add one had a week grid on it. An invite therefore
 * runs /g/ABC → /signup → /courses → /g/ABC?join=1, and the auto-join at the
 * far end still fires — now with sections already saved to put on the grid.
 *
 * Signing *in* is left alone. Someone coming back has done this already.
 */
export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, { next }] = await Promise.all([auth(), searchParams]);
  const to = safeNext(next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);
  const courses = to === "/" ? "/courses" : `/courses?next=${encodeURIComponent(to)}`;
  return <AuthScreen mode="register" next={courses} toggleNext={to} />;
}
