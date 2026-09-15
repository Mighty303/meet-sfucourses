import { NextResponse } from "next/server";
import { casEnabled, casOrigin } from "@/lib/cas";
import { googleEnabled } from "@/lib/google-auth";

/**
 * Operator probe for Auth.js configuration. Returns only booleans / safe
 * hostnames — never secret values — so production can confirm why Google
 * sign-in lands on `error=Configuration` without opening the Vercel UI.
 *
 * `googleReady` is true only when both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET
 * are non-empty. A lone client id still starts OAuth and then fails on
 * callback with Configuration.
 */
export async function GET() {
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? null;
  return NextResponse.json({
    authSecret: Boolean(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()),
    authUrlConfigured: Boolean(authUrl?.trim()),
    authUrlHost: safeHost(authUrl),
    googleId: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
    googleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
    googleReady: googleEnabled(),
    sfuCasEnabled: casEnabled(),
    origin: casOrigin(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

/** Hostname only — enough to spot a *.vercel.app / trailing-slash mistake. */
function safeHost(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
