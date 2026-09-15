import { NextResponse } from "next/server";
import {
  SFU_NEXT_COOKIE,
  SFU_STATE_COOKIE,
  casEnabled,
  casOrigin,
  casServiceUrl,
  validateTicket,
} from "@/lib/cas";
import {
  SFU_SESSION_MAX_AGE,
  casSessionCookieName,
  casSessionSecure,
  mintCasSessionToken,
} from "@/lib/cas-session";
import { safeNext } from "@/lib/safe-next";
import { sfuDbErrorHint, upsertSfuUser } from "@/lib/users";

/**
 * The end of the SFU round trip. CAS has checked the password and sent the
 * visitor back here with a one-time ticket.
 *
 * Ticket validation and the users-row write happen here, and the session JWT
 * is set on this redirect. Going through Auth.js `signIn("sfu-cas")` used to
 * fold every failure (missing state cookie, spent ticket, DB error, cookie
 * write) into one `?error=sfu`, and the helper's cookie path is aimed at
 * Server Actions rather than a Route Handler redirect. Doing the work here
 * keeps the failure steps distinct and the Set-Cookie on the same response
 * as the Location.
 */
export async function GET(req: Request) {
  if (!casEnabled()) return new NextResponse("not found", { status: 404 });

  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket") ?? "";
  // Set by the start route before we handed them to CAS. Re-checked rather
  // than trusted: a cookie is still something a browser sends.
  const next = safeNext(readCookie(req, SFU_NEXT_COOKIE));
  const state = readCookie(req, SFU_STATE_COOKIE);
  // casOrigin(), not url.origin: on Vercel the request URL can be the
  // per-deploy *.vercel.app host even when the browser used the custom domain.
  const origin = casOrigin();
  const secure = casSessionSecure();

  const done = (to: string, sessionToken?: string) => {
    const res = NextResponse.redirect(new URL(to, origin));
    res.cookies.delete(SFU_NEXT_COOKIE);
    res.cookies.delete(SFU_STATE_COOKIE);
    if (sessionToken) {
      res.cookies.set(casSessionCookieName(secure), sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure,
        maxAge: SFU_SESSION_MAX_AGE,
      });
    }
    return res;
  };

  // No state cookie → this browser never started a round trip (or a bounce
  // tracker cleared it). Refuse so a pasted callback URL can't mint a session.
  if (!state) return done("/signin?error=sfu&step=state");
  if (!ticket) return done("/signin?error=sfu&step=ticket");

  const cas = await validateTicket(ticket, casServiceUrl());
  if (!cas) return done("/signin?error=sfu&step=ticket");

  let row;
  try {
    row = await upsertSfuUser(cas);
  } catch (err) {
    const hint = sfuDbErrorHint(err);
    console.error("sfu cas upsert failed", { dbError: hint, err });
    // Non-sensitive hint only (PG code class / short tag, no SQL or secrets).
    return done(`/signin?error=sfu&step=db&dbError=${encodeURIComponent(hint)}`);
  }

  try {
    const sessionToken = await mintCasSessionToken(row);
    return done(next, sessionToken);
  } catch (err) {
    console.error("sfu cas session mint failed", err);
    return done("/signin?error=sfu&step=jwt");
  }
}

/** The cookie by hand — this runs before anything has parsed one for us. */
function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}
