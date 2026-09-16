// Whether the real database still matches what the migrations describe.
//
// This suite branches from production, so the schema it runs against is
// production's, plus whatever the migrations added on top. That makes it the
// only place that can notice the schema drifting away from the files: a table
// created by hand in the Neon console, or one left behind by a migration that
// was later deleted, lives on in production forever and in no repository.
//
// Two tables were found that way — user_day_notes and user_skips, present in
// production, created by no migration and read by no code. Nothing was ever
// going to tell anyone; a database built from db/migrations simply would not
// have them, and the difference would only show up as a query that works in
// production and fails everywhere else.

import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { requireTestBranch } from "./guard";

const hasKey = !!process.env.NEON_API_KEY;

/**
 * Every table db/migrations creates. The migrations suite asserts the same list
 * from the other direction — building it from empty — so the two agreeing is
 * what says production and the files describe one schema.
 */
const FROM_MIGRATIONS = [
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

/**
 * Tables that exist in production, are created by no migration, and are read by
 * no code. Listed rather than ignored so the count can only go down: deleting
 * one is a line in a diff, and adding one has to be argued for here.
 *
 * Dropping them is a separate change — this is a test, and a test should not be
 * the thing that decides a table is safe to lose.
 */
const KNOWN_ORPHANS = ["user_day_notes", "user_skips"];

describe.skipIf(!hasKey)("schema drift", () => {
  requireTestBranch();

  it("has no table the migrations do not create, beyond the known orphans", async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'meetup' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const found = rows.map((r) => r.table_name as string);
    const unexplained = found.filter(
      (t) => !FROM_MIGRATIONS.includes(t) && !KNOWN_ORPHANS.includes(t)
    );

    expect(unexplained).toEqual([]);
  });

  it("has every table the migrations create", async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'meetup' AND table_type = 'BASE TABLE'
    `;
    const found = rows.map((r) => r.table_name as string);

    expect(found).toEqual(expect.arrayContaining(FROM_MIGRATIONS));
  });

  // The view is not a table, so the lists above would miss it going missing.
  it("still has member_courses_effective, which decides which course table a member reads", async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'meetup' AND table_name = 'member_courses_effective'
    `;
    expect(rows).toHaveLength(1);
  });
});
