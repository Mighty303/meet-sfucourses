// What every migration has to survive, on a database that starts with nothing.
//
// Three properties, and each one is a bug this repo has already had or has
// already written a guard against:
//
//   1. They build a schema from empty. The db suite branches from production,
//      so this path is otherwise never walked until somebody sets up a new
//      environment and finds out the hard way.
//
//   2. Re-running from the top is a no-op. `scripts/migrate.mjs` has no ledger
//      — it runs every file every time — so idempotence is not a nicety here,
//      it is the contract. 007 and 010 both carry long comments about the way
//      that broke: DROP CONSTRAINT succeeds, ADD CONSTRAINT is refused, and the
//      table is left with no constraint at all.
//
//   3. Re-running is still a no-op when rows exist that only the *newest*
//      version of a constraint permits. That is the case the guards in 007 and
//      010 exist for, and the one an empty-database re-run cannot reach.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  applyAll,
  applyFile,
  checkConstraints,
  connect,
  dropSchema,
  indexNames,
  migrationFiles,
  tableNames,
} from "./apply";

const hasDb = !!process.env.MIGRATIONS_DATABASE_URL;

/** Every table the migrations are supposed to produce, and only these. */
const EXPECTED_TABLES = [
  "account_merges",
  "attendance",
  "feedback",
  "groups",
  "link_challenges",
  "member_blocks",
  "member_courses",
  "members",
  "sections_cache",
  "user_courses",
  "users",
];

describe.skipIf(!hasDb)("migrations", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("builds the schema from an empty database", async () => {
    await dropSchema(client);
    await applyAll(client);

    expect(await tableNames(client)).toEqual(EXPECTED_TABLES);
  });

  // The one that would have caught the constraint damage 007 documents: a
  // migration run can exit 0 and still leave the schema wrong.
  it("leaves the credential constraint stating the widest rule", async () => {
    const constraints = await checkConstraints(client);

    expect(constraints.users_has_credential).toBeDefined();
    for (const column of ["google_sub", "password_hash", "sfu_username", "merged_into"]) {
      expect(constraints.users_has_credential).toContain(column);
    }
  });

  it("creates the partial unique indexes the doors depend on", async () => {
    expect(await indexNames(client)).toEqual(
      expect.arrayContaining([
        "idx_meetup_users_password_email",
        "idx_meetup_users_sfu_username",
        "idx_meetup_members_group_user",
        "idx_meetup_attendance_class",
        "idx_meetup_attendance_day",
      ])
    );
  });

  it("re-runs from the top without changing the schema", async () => {
    const before = {
      tables: await tableNames(client),
      constraints: await checkConstraints(client),
      indexes: await indexNames(client),
    };

    await applyAll(client);

    expect(await tableNames(client)).toEqual(before.tables);
    expect(await checkConstraints(client)).toEqual(before.constraints);
    expect(await indexNames(client)).toEqual(before.indexes);
  });

  it("runs each file twice in a row without error", async () => {
    // Narrower than the whole-suite re-run, and it localises the blame: this
    // fails naming the one file that is not idempotent.
    for (const file of migrationFiles()) {
      await applyFile(client, file);
      await applyFile(client, file);
    }
  });
});

// Rows that only the newest constraint allows — the case the guards are for.
//
// A tombstone has no credential of its own; it is reachable only through the
// account it was merged into. 010's constraint predates that idea and rejects
// such a row, so a re-run from the top has to be stopped from re-stating it.
// Until somebody merges two accounts in production this is the only place that
// guard is exercised at all.
describe.skipIf(!hasDb)("migrations over rows only the newest schema allows", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
    await dropSchema(client);
    await applyAll(client);

    await client.query(
      `INSERT INTO meetup.users (google_sub, email, google_email, google_email_verified)
       VALUES ('sub-guard', 'guard@sfu.ca', 'guard@sfu.ca', TRUE)`
    );
    await client.query(
      `INSERT INTO meetup.users (sfu_username, sfu_authtype, email, name)
       VALUES ('guard', 'student', 'guard@sfu.ca', 'guard')`
    );
    await client.query(
      `SELECT meetup.merge_accounts(
         (SELECT id FROM meetup.users WHERE sfu_username = 'guard'),
         (SELECT id FROM meetup.users WHERE google_sub = 'sub-guard')
       )`
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it("has a tombstone to be tripped up by", async () => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM meetup.users
       WHERE merged_into IS NOT NULL
         AND google_sub IS NULL AND password_hash IS NULL AND sfu_username IS NULL`
    );
    expect(rows[0].n).toBe(1);
  });

  it("re-runs from the top with the tombstone in place", async () => {
    await applyAll(client);

    // The constraint is still the wide one. Without 010's guard this is where
    // the ADD is refused after the DROP has already gone through, and the
    // table is left with no credential constraint at all.
    const constraints = await checkConstraints(client);
    expect(constraints.users_has_credential).toContain("merged_into");
  });

  it("keeps the tombstone and the account it points at", async () => {
    const { rows } = await client.query(
      `SELECT u.id, u.merged_into, a.sfu_username
       FROM meetup.users u
       JOIN meetup.users a ON a.id = COALESCE(u.merged_into, u.id)
       WHERE u.merged_into IS NOT NULL`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sfu_username).toBe("guard");
  });
});
