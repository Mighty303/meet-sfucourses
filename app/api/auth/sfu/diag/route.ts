import { NextResponse } from "next/server";
import { casEnabled, casOrigin, casServiceUrl } from "@/lib/cas";
import { getDb } from "@/lib/db";
import { sfuDbErrorHint } from "@/lib/users";

/**
 * Production probe for the SFU round trip: which origin we hand CAS, whether
 * this deployment can reach cas.sfu.ca/serviceValidate, and whether migration
 * 010's SFU columns / unique index are present on meetup.users.
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

  const schema = await probeSfuSchema();

  return NextResponse.json({
    origin,
    service,
    authUrlConfigured: Boolean(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    validate,
    schema,
    // Present only when 010 looks missing — operator action, no secrets.
    migrateHint: schema.ok
      ? null
      : "Run `npm run migrate` against the production DATABASE_URL (applies db/migrations/010_sfu_cas.sql).",
  });
}

/**
 * Whether 010_sfu_cas.sql landed: columns + partial unique index. No row
 * data, no connection strings. `ok` is true only when both columns and the
 * expected index exist — if false, run `npm run migrate` against prod
 * DATABASE_URL.
 */
async function probeSfuSchema(): Promise<{
  ok: boolean;
  reachable: boolean;
  columns: { sfu_username: boolean; sfu_authtype: boolean };
  index: { idx_meetup_users_sfu_username: boolean };
  error?: string;
}> {
  try {
    const sql = getDb();
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'meetup'
        AND table_name = 'users'
        AND column_name IN ('sfu_username', 'sfu_authtype')
    `;
    const names = new Set(cols.map((r) => String(r.column_name)));
    const columns = {
      sfu_username: names.has("sfu_username"),
      sfu_authtype: names.has("sfu_authtype"),
    };

    const indexes = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'meetup'
        AND tablename = 'users'
        AND indexname = 'idx_meetup_users_sfu_username'
    `;
    const index = {
      idx_meetup_users_sfu_username: indexes.length > 0,
    };

    return {
      ok: columns.sfu_username && columns.sfu_authtype && index.idx_meetup_users_sfu_username,
      reachable: true,
      columns,
      index,
    };
  } catch (err) {
    return {
      ok: false,
      reachable: false,
      columns: { sfu_username: false, sfu_authtype: false },
      index: { idx_meetup_users_sfu_username: false },
      error: sfuDbErrorHint(err),
    };
  }
}
