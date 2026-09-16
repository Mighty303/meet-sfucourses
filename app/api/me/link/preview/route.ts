import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LINK_COOKIE, planMerge, readLinkChallenge } from "@/lib/account-link";

/**
 * What the merge would do, so the confirm screen can say it before anyone
 * agrees to it. Reads only — the challenge is not spent here, because looking
 * is not deciding.
 *
 * `pending: false` is the ordinary answer for somebody who just opened
 * /profile/link with no round trip in progress; it is not an error.
 */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const token = (await cookies()).get(LINK_COOKIE)?.value;
  const challenge = token ? await readLinkChallenge(token) : null;
  if (!challenge) return NextResponse.json({ pending: false });

  // `same-account` is the common case, not a fault: they started a link and
  // came back without signing in as anybody else.
  const plan = await planMerge(challenge.userId, session.appUserId);
  return NextResponse.json({ pending: true, ...plan });
}
