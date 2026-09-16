/**
 * What the sign-in page says when something sent a visitor back to it.
 *
 * Two sources land here. The SFU round trip is ours and names the step it died
 * at; Auth.js handles Google, and with `pages.error` pointed at /signin it
 * arrives with a small vocabulary of codes instead. Everything in between is a
 * query parameter, which is to say something a browser typed — so each value
 * is matched against a table with `Object.hasOwn` or against a pattern, and
 * anything unrecognised falls back to a sentence that is true of every failure:
 * it didn't finish, start again.
 */

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
 * Auth.js hands the error page a type, not a story.
 *
 * `Configuration` is the one worth wording carefully: it is what every failure
 * that isn't on Auth.js's client-safe list becomes, and the failure mobile
 * actually hits — a PKCE verifier cookie that wasn't there on the way back —
 * is one of them. It is a real misconfiguration only rarely; far more often
 * the round trip outlived the cookie's fifteen minutes, or it began in an
 * app's built-in browser and finished in the real one. So the sentence
 * describes the retry, and the server log keeps the specifics.
 */
const AUTH_ERRORS: Record<string, string> = {
  Configuration:
    "Google sign-in didn't complete — this browser didn't send back the short-lived handoff cookie. That usually means the trip took more than 15 minutes, or it started inside another app's browser. Tap Continue with Google again.",
  AccessDenied: "Google sign-in was refused or cancelled. Try again, or use one of the other doors.",
  Verification: "That sign-in link has already been used or has expired. Start again below.",
  OAuthAccountNotLinked:
    "That Google account isn't the one this email is already signed up with. Use the door you made the account with, then link them from your profile.",
  CredentialsSignin: "That email and password don't match an account.",
};

const AUTH_ERROR_DEFAULT = "Sign-in didn't complete. Start again below.";

/** The query parameters /signin reads. All optional, none trusted. */
export interface SignInErrorParams {
  error?: string;
  step?: string;
  dbError?: string;
  dbColumn?: string;
}

export function signInError({ error, step, dbError, dbColumn }: SignInErrorParams): string | null {
  if (!error) return null;
  // Everything that isn't ours is Auth.js's, and its codes are a closed set.
  if (error !== "sfu") {
    return Object.hasOwn(AUTH_ERRORS, error) ? AUTH_ERRORS[error] : AUTH_ERROR_DEFAULT;
  }

  const base = step && Object.hasOwn(SFU_ERRORS, step) ? SFU_ERRORS[step] : SFU_ERROR_DEFAULT;
  if (step !== "db" || !dbError || !/^[a-z0-9_]{1,40}$/i.test(dbError)) return base;
  // Safe classification, and the column Postgres named when it named one —
  // which is what says *which* migration is missing. Never SQL or row values.
  const column = dbColumn && /^[a-z0-9_]{1,63}$/.test(dbColumn) ? `: ${dbColumn}` : "";
  return `${base} (${dbError}${column})`;
}
