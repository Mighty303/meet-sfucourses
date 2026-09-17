// A Postgres for the migration suite, and nothing else in it.
//
// This suite exists because the `db` one cannot answer the question it needs
// to: that suite branches from production and re-runs the migrations over a
// copy of the real schema, which is the right test for "does this upgrade an
// existing database" and no test at all for "does this build one". A new
// contributor, a new Neon project and a restored backup all start empty.
//
// Plain Postgres rather than a Neon branch, for three reasons. Migrations are
// ordinary SQL — nothing here goes through neon-http — so Neon buys nothing.
// It costs no branch and needs no NEON_API_KEY, which means it runs on pull
// requests from forks, where secrets are withheld and `db` silently skips. And
// it owns its database outright, so it can drop the schema between tests
// without wrecking anything a parallel file is relying on.
//
// Locally that is a Docker container this file starts and stops. In CI it is
// the `services:` sidecar in .github/workflows/test.yml, already listening, so
// DATABASE_URL is set and this does nothing.

import { execFileSync } from "node:child_process";

const CONTAINER = "meetup-migrations-test";
const PORT = Number(process.env.MIGRATIONS_PG_PORT ?? 55432);
const IMAGE = "postgres:17-alpine";

/** Whether a URL was handed to us, as CI does. */
function provided(): string | null {
  return process.env.MIGRATIONS_DATABASE_URL ?? null;
}

function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (allowFailure) return "";
    throw err;
  }
}

export default async function setup() {
  if (provided()) {
    process.env.MIGRATIONS_DATABASE_URL = provided()!;
    return;
  }

  try {
    docker(["info"]);
  } catch {
    // Same bargain the db suite strikes: loud, but not a failure. Nobody should
    // need Docker installed to run `npm test`.
    console.warn(
      "\n  Docker is not running — skipping the migration suite." +
        "\n  Start Docker, or point MIGRATIONS_DATABASE_URL at any throwaway Postgres.\n"
    );
    return;
  }

  // A leftover from a killed run answers on the port but may hold an old
  // schema, so it goes rather than being reused.
  docker(["rm", "-f", CONTAINER], true);
  // trust rather than a password: this container holds nothing, lives for the
  // length of one run, and listens only on loopback. A password here would be
  // a literal credential in the repository protecting nothing.
  docker([
    "run", "-d", "--rm",
    "--name", CONTAINER,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-p", `${PORT}:5432`,
    IMAGE,
  ]);

  await waitForReady();
  process.env.MIGRATIONS_DATABASE_URL = `postgresql://postgres@localhost:${PORT}/postgres`;

  return async () => {
    docker(["stop", CONTAINER], true);
  };
}

/** pg_isready inside the container, so no client is needed out here. */
async function waitForReady(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    try {
      execFileSync("docker", ["exec", CONTAINER, "pg_isready", "-q"], { stdio: "ignore" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${CONTAINER} never became ready`);
}
