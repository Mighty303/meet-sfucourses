// Applying the migrations the way production applies them, and looking at what
// came out.
//
// Through splitStatements, one statement per call, in filename order — the same
// path scripts/migrate.mjs takes. A test that ran each file as one multi-
// statement string would pass on a file neon-http could never run, which is the
// failure this suite is most likely to be asked about.

import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
// Shared with scripts/migrate.mjs, so a file that passes here is one that
// neon-http can actually run a statement at a time.
import { splitStatements } from "../../scripts/sql-statements.mjs";

export const MIGRATIONS_DIR = "db/migrations";

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

export async function connect(): Promise<Client> {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) throw new Error("MIGRATIONS_DATABASE_URL is unset — setup.ts should have set it");
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Run one migration file, statement by statement. Throws what Postgres threw. */
export async function applyFile(client: Client, file: string): Promise<number> {
  const statements = splitStatements(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${file}: ${message}\n\n${statement.slice(0, 300)}`);
    }
  }
  return statements.length;
}

/** Every migration, in order, as `npm run migrate` would. */
export async function applyAll(client: Client): Promise<void> {
  for (const file of migrationFiles()) await applyFile(client, file);
}

/** Back to nothing, so a test can prove the from-scratch path rather than assume it. */
export async function dropSchema(client: Client): Promise<void> {
  await client.query("DROP SCHEMA IF EXISTS meetup CASCADE");
}

export async function tableNames(client: Client): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'meetup' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((r) => r.table_name as string);
}

/** Constraint definitions by name, for the tables this schema owns. */
export async function checkConstraints(client: Client): Promise<Record<string, string>> {
  const { rows } = await client.query(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'meetup' AND c.contype = 'c'
     ORDER BY c.conname`
  );
  return Object.fromEntries(rows.map((r) => [r.conname as string, r.def as string]));
}

export async function indexNames(client: Client): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'meetup' ORDER BY indexname`
  );
  return rows.map((r) => r.indexname as string);
}
