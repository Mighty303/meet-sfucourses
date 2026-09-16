import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The production deployment answers to two names: the one Vercel generates and
 * the one people type. Only the second is registered with SFU's CAS and with
 * Google OAuth, so a visitor who arrives at the generated hostname is sent
 * across before they can start a sign-in that was always going to fail.
 *
 * Preview deployments keep their own hostname — VERCEL_ENV reads "preview"
 * there, and a PR is no use if opening it bounces you to production.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (process.env.VERCEL_ENV !== "production" || !host.endsWith(".vercel.app")) {
    return NextResponse.next();
  }

  const url = new URL(request.url);
  url.protocol = "https:";
  url.host = "meet.sfucourses.com";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
