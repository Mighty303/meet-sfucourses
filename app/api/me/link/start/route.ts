import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LINK_COOKIE, LINK_MAX_AGE, createLinkChallenge } from "@/lib/account-link";
import { casSessionSecure } from "@/lib/cas-session";

/**
 * Begin a link: remember, for ten minutes, that this browser was signed in as
 * this account.
 *
 * What happens next is an ordinary sign-in to the other account, through
 * whichever door it uses. The cookie is the only thing that survives it, and
 * it is what lets /api/me/link/confirm know there are two proven halves rather
 * than one person who simply signed in twice.
 *
 * Lax rather than Strict for the same reason the CAS cookies are: the request
 * that reads it can be a redirect back from cas.sfu.ca or from Google, which
 * is cross-site by definition.
 */
export async function POST() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const token = await createLinkChallenge(session.appUserId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: casSessionSecure(),
    path: "/",
    maxAge: LINK_MAX_AGE,
  });
  return res;
}
