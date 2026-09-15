// Stands a throwaway Neon branch up for the DB suite, migrates it, and deletes
// it afterwards.
//
// Two rules this file exists to enforce:
//
//  1. It NEVER runs against the DATABASE_URL in .env.local. That points at the
//     production branch, and these tests insert, update and delete. The only
//     database it will use is one it created itself.
//  2. Without NEON_API_KEY it skips, loudly but without failing, so `npm test`
//     and CI never need credentials to be green.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const API = "https://console.neon.tech/api/v2";
/** Long enough for a slow suite, short enough that a crashed run self-cleans. */
const BRANCH_TTL_MINUTES = 60;

interface NeonBranch {
  id: string;
  name: string;
}

function projectId(): string {
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;
  // .neon is gitignored, so it is a convenience for local runs, not a source
  // CI can rely on.
  try {
    return JSON.parse(readFileSync(".neon", "utf8")).projectId;
  } catch {
    throw new Error("no NEON_PROJECT_ID and no readable .neon file");
  }
}

async function neon(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NEON_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Neon API ${res.status} ${init.method ?? "GET"} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export default async function setup() {
  if (!process.env.NEON_API_KEY) {
    // Not a failure: the unit suite covers the logic, and nobody should need a
    // cloud account to run the tests.
    console.warn(
      "\n  NEON_API_KEY is not set — skipping the database suite." +
        "\n  Create a key at https://console.neon.tech/app/settings/api-keys and" +
        "\n  re-run with NEON_API_KEY=... npm run test:db\n"
    );
    // The suite's own files check the same variable and skip themselves; this
    // returns without creating anything so there is nothing to tear down.
    return;
  }

  const id = projectId();
  const name = `vitest-${Date.now()}`;
  const expires = new Date(Date.now() + BRANCH_TTL_MINUTES * 60_000).toISOString();

  console.log(`creating Neon branch ${name} on project ${id}...`);
  const created = (await neon(`/projects/${id}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name, expires_at: expires },
      endpoints: [{ type: "read_write" }],
    }),
  })) as { branch: NeonBranch; connection_uris: { connection_uri: string }[] };

  const uri = created.connection_uris?.[0]?.connection_uri;
  if (!uri) throw new Error("Neon created the branch but returned no connection URI");

  // The only place DATABASE_URL is set for these tests. lib/db.ts reads it at
  // call time, so this reaches every query without touching app code.
  process.env.DATABASE_URL = uri;

  console.log("running migrations...");
  execFileSync("node", ["scripts/migrate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: uri },
  });

  return async () => {
    console.log(`deleting Neon branch ${created.branch.name}...`);
    try {
      await neon(`/projects/${id}/branches/${created.branch.id}`, { method: "DELETE" });
    } catch (err) {
      // The branch has expires_at set, so Neon will reap it regardless.
      console.warn(`could not delete branch ${created.branch.name}: ${String(err)}`);
    }
  };
}
