import { encode } from "@auth/core/jwt";
import type { AppUser } from "@/lib/users";
import { casOrigin } from "@/lib/cas";

/**
 * How long an SFU-minted session lasts. Matches Auth.js's default so a CAS
 * sign-in doesn't expire on a different schedule than Google or password.
 */
export const SFU_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Whether session cookies should carry the Secure / __Secure- prefix.
 *
 * Driven by the configured site origin rather than NODE_ENV: a production
 * build served on http://localhost (or a preview that somehow isn't https)
 * must still be able to set a cookie the browser will keep.
 */
export function casSessionSecure(): boolean {
  return casOrigin().startsWith("https://");
}

/**
 * The Auth.js session cookie name for this origin. The JWT salt is this
 * string, so minting a token under any other name would look signed-out.
 */
export function casSessionCookieName(secure = casSessionSecure()): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Build the encrypted JWT Auth.js will accept as a session, with the same
 * claims the sfu-cas jwt callback would have stamped after authorize().
 *
 * The CAS callback sets this on the redirect response itself rather than
 * going through Auth.js's signIn() helper: that helper is built for Server
 * Actions, and a rejected or half-applied cookie write there collapses every
 * failure mode into the same ?error=sfu.
 */
export async function mintCasSessionToken(user: AppUser): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");

  const salt = casSessionCookieName();
  return encode({
    token: {
      name: user.name,
      email: user.email,
      picture: user.avatar ?? user.image,
      sub: String(user.id),
      appUserId: user.id,
      hasGoogle: false,
      avatar: user.avatar,
    },
    secret,
    salt,
    maxAge: SFU_SESSION_MAX_AGE,
  });
}
