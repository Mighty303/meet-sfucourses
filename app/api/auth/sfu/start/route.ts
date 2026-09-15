import { NextResponse } from "next/server";
import {
  SFU_NEXT_COOKIE,
  SFU_NEXT_MAX_AGE,
  SFU_STATE_COOKIE,
  casEnabled,
  casLoginUrl,
  casOrigin,
  casServiceUrl,
  newCasState,
} from "@/lib/cas";
import { safeNext } from "@/lib/safe-next";

/**
 * The start of the SFU round trip: hand the visitor to cas.sfu.ca and ask it to
 * send them back to us with a ticket.
 *
 * Where they wanted to be afterwards rides in a cookie rather than in the
 * service URL, because CAS binds a ticket to the exact service string it was
 * issued for — a `?next=` on the way out and not on the way back is the classic
 * way this breaks. A constant service URL can't drift.
 *
 * A second cookie (`sfu-cas-state`) marks that this browser began the trip, so
 * a callback URL alone cannot sign someone else in with a ticket they didn't
 * request.
 *
 * Cookies are set on a 200 HTML page that then navigates to CAS, not on a 307
 * redirect. A Set-Cookie on an immediate cross-site redirect is exactly the
 * bounce Chrome's tracking mitigations are willing to discard — and without
 * the state cookie every return lands on ?error=sfu.
 */
export async function GET(req: Request) {
  // Not 403: with CAS off this endpoint doesn't exist as far as anyone is
  // concerned, and the sign-in page renders no button pointing at it.
  if (!casEnabled()) return new NextResponse("not found", { status: 404 });

  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const login = casLoginUrl(casServiceUrl());
  const secure = casOrigin().startsWith("https://");
  const cookie = {
    httpOnly: true,
    // Lax, not Strict: the request that reads these cookies is a redirect back
    // from cas.sfu.ca, which is cross-site by definition. A Strict cookie
    // wouldn't be sent and everyone would land on the home page.
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SFU_NEXT_MAX_AGE,
  };

  // JSON.stringify for the script URL; attribute escaping for href / refresh.
  const href = escapeAttr(login);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Continuing to SFU…</title>
<meta http-equiv="refresh" content="0;url=${href}">
<script>location.replace(${JSON.stringify(login)})</script>
</head>
<body>
<p>Continuing to SFU sign-in…</p>
<p><a href="${href}">Continue</a></p>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
  res.cookies.set(SFU_NEXT_COOKIE, next, cookie);
  res.cookies.set(SFU_STATE_COOKIE, newCasState(), cookie);
  return res;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
