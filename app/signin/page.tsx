import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { safeNext } from "@/lib/safe-next";

const SFU_ERRORS: Record<string, string> = {
  state:
    "SFU sign-in didn't complete — this browser lost the short-lived handoff cookie. Start again below (one click, don't refresh the return link).",
  ticket:
    "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once — start again below.",
  session:
    "SFU signed you in at cas.sfu.ca, but creating a session here failed. Try again; if it keeps happening the database may need migration 010.",
  db:
    "SFU signed you in at cas.sfu.ca, but saving your account here failed. Try again; if it keeps happening the database may need migration 010.",
  jwt:
    "SFU signed you in and saved your account, but creating the browser session failed. Try again.",
};

const SFU_ERROR_DEFAULT =
  "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once — start again below.";

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; step?: string }>;
}) {
  const [session, { next, error, step }] = await Promise.all([auth(), searchParams]);
  const to = safeNext(next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);
  // Only the SFU round trip sends anyone back here with an error; next-auth's
  // own failures are handled inside the panel. `step` narrows which half failed.
  const sfuError =
    error === "sfu" ? (step && SFU_ERRORS[step]) || SFU_ERROR_DEFAULT : null;
  return <AuthScreen mode="signin" next={to} error={sfuError} />;
}
