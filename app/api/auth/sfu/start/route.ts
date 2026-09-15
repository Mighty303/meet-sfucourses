import { NextResponse } from "next/server";
import { SFU_NEXT_COOKIE, SFU_NEXT_MAX_AGE, casEnabled, casLoginUrl, casServiceUrl } from "@/lib/cas";
import { safeNext } from "@/lib/safe-next";

/**
 * The start of the SFU round trip: hand the visitor to cas.sfu.ca and ask it to
 * send them back to us with a ticket.
 *
 * Where they wanted to be afterwards rides in a cookie rather than in the
 * service URL, because CAS binds a ticket to the exact service string it was
 * issued for — a `?next=` on the way out and not on the way back is the classic
 * way this breaks. A constant service URL can't drift.
 */
export async function GET(req: Request) {
  // Not 403: with CAS off this endpoint doesn't exist as far as anyone is
  // concerned, and the sign-in page renders no button pointing at it.
  if (!casEnabled()) return new NextResponse("not found", { status: 404 });

  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const res = NextResponse.redirect(casLoginUrl(casServiceUrl()));
  res.cookies.set(SFU_NEXT_COOKIE, next, {
    httpOnly: true,
    // Lax, not Strict: the request that reads this cookie is a redirect back
    // from cas.sfu.ca, which is cross-site by definition. A Strict cookie
    // wouldn't be sent and everyone would land on the home page.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SFU_NEXT_MAX_AGE,
  });
  return res;
}
