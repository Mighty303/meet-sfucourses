import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { safeNext } from "@/lib/safe-next";

const SFU_ERRORS: Record<string, string> = {
  state:
    "SFU sign-in didn't complete. This browser lost the short-lived handoff cookie. Start again below (one click, don't refresh the return link).",
  ticket:
    "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once. Start again below.",
  session:
    "SFU signed you in at cas.sfu.ca, but creating a session here failed. Try again; if it keeps happening the database may be behind the code.",
  db:
    "SFU signed you in at cas.sfu.ca, but saving your account here failed. Try again; if it keeps happening the database may be behind the code.",
  jwt:
    "SFU signed you in and saved your account, but creating the browser session failed. Try again.",
};

const SFU_ERROR_DEFAULT =
  "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once. Start again below.";

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
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
  const [session, { next, error, step, dbError, dbColumn }] = await Promise.all([
    auth(),
    searchParams,
  ]);
  const to = safeNext(next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);
  // Only the SFU round trip sends anyone back here with an error; next-auth's
  // own failures are handled inside the panel. `step` narrows which half failed.
  let sfuError =
    error === "sfu" ? (step && SFU_ERRORS[step]) || SFU_ERROR_DEFAULT : null;
  // Safe classification and, when Postgres named one, the column it wanted —
  // which is what says *which* migration is missing. Never SQL or secrets, and
  // re-checked here because both arrive as query parameters.
  if (sfuError && step === "db" && dbError && /^[a-z0-9_]{1,40}$/i.test(dbError)) {
    const column = dbColumn && /^[a-z0-9_]{1,63}$/.test(dbColumn) ? `: ${dbColumn}` : "";
    sfuError = `${sfuError} (${dbError}${column})`;
  }
  return <AuthScreen mode="signin" next={to} error={sfuError} />;
}
