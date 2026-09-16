import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { safeNext } from "@/lib/safe-next";
import { signInError } from "@/lib/signin-errors";

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
 *
 * The other parameters are a failure reported back: `error` and `step` from
 * our own SFU route, or `error` alone from Auth.js, which now has `pages.error`
 * pointed here rather than at its own page. signInError() turns whichever
 * arrived into a sentence, and returns null when none did.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    step?: string;
    dbError?: string;
    dbColumn?: string;
  }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const to = safeNext(params.next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);
  return <AuthScreen mode="signin" next={to} error={signInError(params)} />;
}
