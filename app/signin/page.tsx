import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { safeNext } from "@/lib/safe-next";

const SFU_ERROR =
  "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once — start again below.";

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [session, { next, error }] = await Promise.all([auth(), searchParams]);
  const to = safeNext(next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);
  // Only the SFU round trip sends anyone back here with an error; next-auth's
  // own failures are handled inside the panel.
  return <AuthScreen mode="signin" next={to} error={error === "sfu" ? SFU_ERROR : null} />;
}
