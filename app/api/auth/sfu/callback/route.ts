import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { SFU_NEXT_COOKIE, SFU_STATE_COOKIE, casEnabled } from "@/lib/cas";
import { safeNext } from "@/lib/safe-next";

/**
 * The end of the SFU round trip. CAS has checked the password and sent the
 * visitor back here with a one-time ticket; the `sfu-cas` provider in auth.ts
 * redeems it, which is the only place the ticket is believed.
 *
 * `redirect: false` so the failure path is ours to choose. Left to itself,
 * next-auth would send a rejected ticket to its own error page, which says
 * "CredentialsSignin" to someone who typed nothing and clicked one button.
 */
export async function GET(req: Request) {
  if (!casEnabled()) return new NextResponse("not found", { status: 404 });

  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket") ?? "";
  // Set by the start route before we handed them to CAS. Re-checked rather
  // than trusted: a cookie is still something a browser sends.
  const next = safeNext(readCookie(req, SFU_NEXT_COOKIE));
  const state = readCookie(req, SFU_STATE_COOKIE);

  const done = (to: string) => {
    const res = NextResponse.redirect(new URL(to, url.origin));
    res.cookies.delete(SFU_NEXT_COOKIE);
    res.cookies.delete(SFU_STATE_COOKIE);
    return res;
  };

  // No state cookie → this browser never started a round trip. Refuse so a
  // pasted callback URL can't mint a session for whoever holds the ticket.
  if (!state || !ticket) return done("/signin?error=sfu");

  try {
    const after = await signIn("sfu-cas", { ticket, redirect: false, redirectTo: next });
    // A bad, expired, or already-spent ticket comes back as an error in the
    // URL rather than a throw, because signIn runs Auth in raw mode.
    if (typeof after === "string" && after.includes("error=")) return done("/signin?error=sfu");
  } catch {
    return done("/signin?error=sfu");
  }

  return done(next);
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
