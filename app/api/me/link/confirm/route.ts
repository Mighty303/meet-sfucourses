import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  LINK_COOKIE,
  consumeLinkChallenge,
  mergeAccounts,
  planMerge,
  readLinkChallenge,
} from "@/lib/account-link";
import {
  SFU_SESSION_MAX_AGE,
  casSessionCookieName,
  casSessionSecure,
  mintSessionToken,
} from "@/lib/cas-session";

const REFUSALS: Record<string, string> = {
  "same-account": "You're still signed in as the same account. Sign in as the other one first.",
  "two-sfu-accounts": "Those are two different SFU computing IDs, so they aren't one person's accounts.",
  "missing-account": "One of those accounts no longer exists.",
};

/**
 * Fold the two proven accounts together.
 *
 * Both halves are proved by the time this runs: the challenge cookie says this
 * browser held the first account ten minutes ago, and the session says it
 * holds the second one now. Neither is an address anybody typed.
 *
 * The challenge is spent before the merge, not after. A double-submitted
 * confirm has to lose the second time, and the merge is not idempotent — the
 * second run would raise on a tombstone, which is a worse way to find out.
 *
 * A fresh session cookie goes out on this response. The browser is signed in
 * as the absorbed account whenever that isn't the survivor, and leaving it
 * that way would sit them on a tombstone with an empty-looking profile.
 */
export async function POST() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const jar = await cookies();
  const token = jar.get(LINK_COOKIE)?.value;
  const challenge = token ? await readLinkChallenge(token) : null;
  if (!challenge) {
    return NextResponse.json(
      { error: "that link request has expired. Start again from your profile." },
      { status: 400 }
    );
  }

  const plan = await planMerge(challenge.userId, session.appUserId);
  if ("error" in plan) {
    return NextResponse.json({ error: REFUSALS[plan.error] }, { status: 409 });
  }

  if (!(await consumeLinkChallenge(challenge.id))) {
    return NextResponse.json({ error: "that link request has already been used" }, { status: 409 });
  }

  const { result, account } = await mergeAccounts(plan.survivor.id, plan.absorbed.id);

  const res = NextResponse.json({ account, ...result });
  res.cookies.delete(LINK_COOKIE);
  const secure = casSessionSecure();
  res.cookies.set(casSessionCookieName(secure), await mintSessionToken(account), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: SFU_SESSION_MAX_AGE,
  });
  return res;
}
