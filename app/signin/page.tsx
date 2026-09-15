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
    "SFU signed you in at cas.sfu.ca, but creating a session here failed. Try again; if it keeps happening the database may need migration 010.",
  db:
    "SFU signed you in at cas.sfu.ca, but saving your account here failed. Try again; if it keeps happening the database may need migration 010.",
  jwt:
    "SFU signed you in and saved your account, but creating the browser session failed. Try again.",
};

const SFU_ERROR_DEFAULT =
  "SFU sign-in didn't complete. The link back from cas.sfu.ca is only good once. Start again below.";

/** Auth.js folds most OAuth/server failures into this one client-safe label. */
const AUTHJS_ERRORS: Record<string, string> = {
  Configuration:
    "Sign-in is misconfigured on the server. Google needs both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on Vercel (Production), plus AUTH_SECRET and AUTH_URL=https://meet.sfucourses.com. Check /api/auth/config-diag (booleans only), then redeploy.",
  AccessDenied: "That sign-in was denied. Try another method below.",
  Verification: "That sign-in link is no longer valid. Start again below.",
  OAuthCallbackError:
    "Google sign-in didn't complete. Try again; if it keeps happening, confirm the OAuth client secret and redirect URI on Google Cloud.",
  Default: "Sign-in didn't complete. Try again below.",
};

/**
 * `?next=` is where to land afterwards — set by whatever sent you here, so a
 * group invite you opened signed out gets you back to that group.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; step?: string; dbError?: string }>;
}) {
  const [session, { next, error, step, dbError }] = await Promise.all([auth(), searchParams]);
  const to = safeNext(next);
  // Already signed in: this page has nothing to offer, and leaving it reachable
  // means a stale tab can sign you into a second account by accident.
  if (session?.appUserId) redirect(to);

  let banner: string | null = null;
  if (error === "sfu") {
    banner = (step && SFU_ERRORS[step]) || SFU_ERROR_DEFAULT;
    // Safe classification only (e.g. missing_column) — never SQL or secrets.
    if (step === "db" && dbError && /^[a-z0-9_]{1,40}$/i.test(dbError)) {
      banner = `${banner} (${dbError})`;
    }
  } else if (error) {
    banner = AUTHJS_ERRORS[error] ?? AUTHJS_ERRORS.Default;
  }

  return <AuthScreen mode="signin" next={to} error={banner} />;
}
