// Folding two accounts into one, against a real Postgres.
//
// The interesting parts of merge_accounts are all consequences of constraints
// the unit suite cannot see: three partial unique indexes deciding what order
// the credentials may move in, one more forbidding the same person twice in a
// group, and a CHECK that every row be reachable. So this runs the whole
// function and then goes and looks at the rows.
//
// The promise being tested, in one line: after a merge every door that used to
// open either account opens the survivor, and nothing but duplicates is lost.

import { beforeAll, describe, expect, it } from "vitest";
import {
  countDoors,
  mergeAccounts,
  planMerge,
  unlinkDoor,
} from "@/lib/account-link";
import { setAttendance } from "@/lib/attendance";
import { getDb } from "@/lib/db";
import { addMember, createGroup, type Group } from "@/lib/groups";
import { addUserCourse, listUserCourses } from "@/lib/user-courses";
import { getUser, upsertSfuUser, upsertUser, type AppUser } from "@/lib/users";
import { SAMPLE_TERM } from "../fixtures/term-sample";
import { requireTestBranch } from "./guard";

const hasKey = !!process.env.NEON_API_KEY;

/** Unique per run, so re-running against a warm branch doesn't collide. */
const tag = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!hasKey)("merging accounts", () => {
  requireTestBranch();

  let google: AppUser;
  let sfu: AppUser;
  let shared: Group;
  let googleOnly: Group;
  let sfuOnly: Group;
  const id = tag();

  beforeAll(async () => {
    const sql = getDb();
    google = await upsertUser({
      googleSub: `sub-${id}`,
      email: `${id}@sfu.ca`,
      name: "Long-time user",
      image: "https://example.test/g.png",
      emailVerified: true,
    });
    ({ user: sfu } = await upsertSfuUser({ username: id, authtype: "student" }));

    // A term's worth of everything on the Google account, which is the case
    // issue #31 describes: signed in with Google all term, then with CAS.
    shared = await createGroup(`shared-${id}`, SAMPLE_TERM, google.id);
    googleOnly = await createGroup(`google-${id}`, SAMPLE_TERM, google.id);
    sfuOnly = await createGroup(`sfu-${id}`, SAMPLE_TERM, sfu.id);
    await addMember(shared.id, "Ada", google.id);
    await addMember(googleOnly.id, "Ada", google.id);
    await addMember(shared.id, id, sfu.id);
    await addMember(sfuOnly.id, id, sfu.id);

    await addUserCourse(google.id, SAMPLE_TERM, "1001");
    await addUserCourse(google.id, SAMPLE_TERM, "1002");
    await addUserCourse(sfu.id, SAMPLE_TERM, "1002");
    await addUserCourse(sfu.id, SAMPLE_TERM, "1003");

    // Both said something about the same day: the survivor's answer wins.
    await setAttendance(google.id, "2026-10-14", null, "skipping", "google");
    await setAttendance(sfu.id, "2026-10-14", null, "remote", "sfu");
    await setAttendance(sfu.id, "2026-10-15", null, "skipping", "sfu only");

    await sql`
      INSERT INTO meetup.feedback (user_id, message) VALUES (${google.id}, 'from the google row')
    `;
  });

  it("plans the SFU row as the survivor and names the shared group", async () => {
    const plan = await planMerge(google.id, sfu.id);
    if ("error" in plan) throw new Error(plan.error);

    expect(plan.survivor.id).toBe(sfu.id);
    expect(plan.absorbed.id).toBe(google.id);
    expect(plan.survivor.email).toBe(`${id}@sfu.ca`);
    expect(plan.sharedGroups.map((g) => g.name)).toEqual([`shared-${id}`]);
  });

  it("folds everything onto the SFU account", async () => {
    const sql = getDb();
    const { result, account } = await mergeAccounts(sfu.id, google.id);

    expect(result.survivor).toBe(sfu.id);
    expect(account.email).toBe(`${id}@sfu.ca`);
    // The Google credential moved into the gap on the SFU row.
    expect(account.hasGoogle).toBe(true);
    expect(account.googleEmail).toBe(`${id}@sfu.ca`);

    // Courses are a union, and the one both held is not counted twice.
    expect((await listUserCourses(sfu.id, SAMPLE_TERM)).sort()).toEqual(["1001", "1002", "1003"]);
    expect(await listUserCourses(google.id, SAMPLE_TERM)).toEqual([]);

    // The survivor's answer for the contested day stands; the other day moved.
    const days = await sql`
      SELECT on_date::text AS on_date, status, note FROM meetup.attendance
      WHERE user_id = ${sfu.id} ORDER BY on_date
    `;
    expect(days.map((d) => [d.on_date, d.status])).toEqual([
      ["2026-10-14", "remote"],
      ["2026-10-15", "skipping"],
    ]);
    expect(days[0].note).toBe("sfu");

    // One member row in the group both were in, both rows elsewhere.
    const members = await sql`
      SELECT g.name, COUNT(*)::int AS n FROM meetup.members m
      JOIN meetup.groups g ON g.id = m.group_id
      WHERE m.user_id = ${sfu.id} GROUP BY g.name ORDER BY g.name
    `;
    expect(members.map((m) => [m.name, m.n])).toEqual([
      [`google-${id}`, 1],
      [`sfu-${id}`, 1],
      [`shared-${id}`, 1],
    ]);
    expect(result.dropped.duplicate_members).toBe(1);

    // Groups the absorbed row owned, and its feedback, point at the survivor.
    const owned = await sql`
      SELECT COUNT(*)::int AS n FROM meetup.groups
      WHERE owner_user_id = ${sfu.id} AND id IN (${shared.id}, ${googleOnly.id}, ${sfuOnly.id})
    `;
    expect(owned[0].n).toBe(3);
    const feedback = await sql`
      SELECT user_id FROM meetup.feedback WHERE message = 'from the google row'
    `;
    expect(feedback[0].user_id).toBe(sfu.id);
  });

  it("leaves the absorbed row as a tombstone rather than deleting it", async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT email, name, merged_into, google_sub, sfu_username, created_at
      FROM meetup.users WHERE id = ${google.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].merged_into).toBe(sfu.id);
    // Its identity survives; its credentials moved.
    expect(rows[0].email).toBe(`${id}@sfu.ca`);
    expect(rows[0].name).toBe("Long-time user");
    expect(rows[0].google_sub).toBeNull();
    expect(rows[0].created_at).not.toBeNull();
  });

  it("resolves the old id to the surviving account", async () => {
    // The shape of a session cookie minted before the merge, on some other
    // device, which is the reason the row is kept at all.
    expect((await getUser(google.id))?.id).toBe(sfu.id);
  });

  it("keeps the Google door opening the merged account", async () => {
    const again = await upsertUser({
      googleSub: `sub-${id}`,
      email: `${id}@sfu.ca`,
      name: "Long-time user",
      image: null,
      emailVerified: true,
    });
    expect(again.id).toBe(sfu.id);
    // And the refresh has not taken the verified address back off the account.
    expect(again.email).toBe(`${id}@sfu.ca`);
  });

  it("refuses to merge a tombstone", async () => {
    await expect(mergeAccounts(sfu.id, google.id)).rejects.toThrow(/tombstone/);
  });

  it("counts doors across the account and unlinks one", async () => {
    expect(await countDoors(sfu.id)).toEqual({ google: 1, password: 0, sfu: 1 });
    await unlinkDoor(sfu.id, "google");
    expect(await countDoors(sfu.id)).toEqual({ google: 0, password: 0, sfu: 1 });

    // users_has_credential still holds, for the tombstone as well.
    const sql = getDb();
    const rows = await sql`
      SELECT id FROM meetup.users
      WHERE (id = ${sfu.id} OR merged_into = ${sfu.id})
        AND google_sub IS NULL AND password_hash IS NULL
        AND sfu_username IS NULL AND merged_into IS NULL
    `;
    expect(rows).toHaveLength(0);
  });
});
