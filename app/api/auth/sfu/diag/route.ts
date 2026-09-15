import { NextResponse } from "next/server";
import { casEnabled, casOrigin, casServiceUrl } from "@/lib/cas";

/**
 * Production probe for the SFU round trip: which origin we hand CAS, and
 * whether this deployment can reach cas.sfu.ca/serviceValidate at all.
 *
 * A fake ticket must produce authenticationFailure (healthy). Returns no
 * secrets. Gated on the same flag as the real door.
 */
export async function GET() {
  if (!casEnabled()) return new NextResponse("not found", { status: 404 });

  const origin = casOrigin();
  const service = casServiceUrl();
  // Same host the real validator uses by default; SFU_CAS_BASE overrides are
  // refused in production unless https, so the public IdP is the right probe.
  const validateUrl =
    `${(process.env.SFU_CAS_BASE ?? "https://cas.sfu.ca/cas").replace(/\/+$/, "")}` +
    `/serviceValidate?service=${encodeURIComponent(service)}&ticket=ST-diag`;

  let validate: {
    reachable: boolean;
    status?: number;
    failureCode?: string | null;
    error?: string;
  };
  try {
    const res = await fetch(validateUrl, { cache: "no-store" });
    const xml = await res.text();
    validate = {
      reachable: true,
      status: res.status,
      failureCode: xml.match(/authenticationFailure[^>]*code="([^"]+)"/)?.[1] ?? null,
    };
  } catch (err) {
    validate = { reachable: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    origin,
    service,
    authUrlConfigured: Boolean(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    validate,
  });
}
