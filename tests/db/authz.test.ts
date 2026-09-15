// Who may edit whom, and what leaving a group does to it.
//
// Ported from scripts/check-authz.mjs, which asserted all of this against the
// production database and — because it had to run without a bundler — kept its
// own copies of canEditMember, claimMember, addMember and removeMember inline.
// The copies drifting from lib/groups.ts was a real hazard its own comment
// flagged. This imports the functions the app actually calls.

import { describe, expect, it } from "vitest";
import {
  addMember,
  canEditMember,
  claimMember,
  createGroup,
  deleteGroup,
  findGroup,
  findMemberForUser,
  isGroupOwner,
  removeMember,
} from "@/lib/groups";
import { getDb } from "@/lib/db";
import { upsertUser } from "@/lib/users";
import { PEOPLE, TEST_GROUP } from "../fixtures/people";
import { requireTestBranch } from "./guard";

const hasKey = !!process.env.NEON_API_KEY;

async function user(key: string) {
  const p = PEOPLE.find((x) => x.key === key)!;
  return upsertUser({ googleSub: p.googleSub, email: p.email, name: p.name, image: null });
}

/** A legacy member row with no owner — what every row looked like pre-accounts. */
async function ownerlessMember(groupId: number, name: string): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.members (group_id, display_name, color, user_id)
    VALUES (${groupId}, ${name}, ${PEOPLE[0].color}, NULL)
    RETURNING id
  `;
  return rows[0].id as number;
}

describe.skipIf(!hasKey)("member edit authorization", () => {
  requireTestBranch();

  it("lets a member edit their own row and nobody else's", async () => {
    const [ada, bo] = [await user("ada"), await user("bo")];
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const adaMember = await addMember(group.id, "Ada", ada.id);

    expect(await canEditMember(adaMember.id, group.id, ada.id)).toBe(true);
    expect(await canEditMember(adaMember.id, group.id, bo.id)).toBe(false);
    expect(await canEditMember(adaMember.id, group.id, null)).toBe(false);

    await deleteGroup(group.id);
  });

  it("leaves an ownerless legacy row open to anyone with the code", async () => {
    // Deliberate: those rows predate accounts, and locking them would strand
    // the schedules on them.
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const legacy = await ownerlessMember(group.id, "Legacy");
    const bo = await user("bo");

    expect(await canEditMember(legacy, group.id, bo.id)).toBe(true);
    expect(await canEditMember(legacy, group.id, null)).toBe(true);

    await deleteGroup(group.id);
  });

  it("refuses a member id from a different group", async () => {
    const ada = await user("ada");
    const [a, b] = [
      await createGroup("Group A", TEST_GROUP.term, null),
      await createGroup("Group B", TEST_GROUP.term, null),
    ];
    const member = await addMember(a.id, "Ada", ada.id);

    expect(await canEditMember(member.id, b.id, ada.id)).toBe(false);

    await deleteGroup(a.id);
    await deleteGroup(b.id);
  });
});

describe.skipIf(!hasKey)("claiming a legacy row", () => {
  requireTestBranch();

  it("attaches the row to the claimer and brings its courses along", async () => {
    // Claiming your own name must not look like it wiped your schedule.
    const sql = getDb();
    const cy = await user("cy");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const legacy = await ownerlessMember(group.id, "Cy");
    await sql`INSERT INTO meetup.member_courses (member_id, class_number) VALUES (${legacy}, '1234')`;

    expect(await claimMember(legacy, group.id, cy.id)).toBe("ok");

    const carried = await sql`
      SELECT class_number FROM meetup.user_courses
      WHERE user_id = ${cy.id} AND term = ${TEST_GROUP.term}
    `;
    expect(carried.map((r) => r.class_number)).toContain("1234");

    await deleteGroup(group.id);
  });

  it("refuses a row that already has an owner", async () => {
    const [ada, bo] = [await user("ada"), await user("bo")];
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const adaMember = await addMember(group.id, "Ada", ada.id);

    expect(await claimMember(adaMember.id, group.id, bo.id)).toBe("not-claimable");

    await deleteGroup(group.id);
  });

  it("refuses a second row to someone already in the group", async () => {
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    await addMember(group.id, "Ada", ada.id);
    const legacy = await ownerlessMember(group.id, "Someone");

    expect(await claimMember(legacy, group.id, ada.id)).toBe("already-member");

    await deleteGroup(group.id);
  });
});

describe.skipIf(!hasKey)("group ownership", () => {
  requireTestBranch();

  it("gives the group to the first person through the door", async () => {
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    expect(await isGroupOwner(group.id, ada.id)).toBe(false);

    await addMember(group.id, "Ada", ada.id);
    expect(await isGroupOwner(group.id, ada.id)).toBe(true);

    await deleteGroup(group.id);
  });

  it("hands ownership to the earliest remaining member when the owner leaves", async () => {
    // An admin outside the group could still delete it while nobody inside
    // could — so it has to follow someone who is actually still there.
    const [ada, bo] = [await user("ada"), await user("bo")];
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const adaMember = await addMember(group.id, "Ada", ada.id);
    await addMember(group.id, "Bo", bo.id);

    await removeMember(adaMember.id, group.id);

    expect(await isGroupOwner(group.id, bo.id)).toBe(true);
    expect(await isGroupOwner(group.id, ada.id)).toBe(false);

    await deleteGroup(group.id);
  });

  it("leaves the group ownerless when the last member goes", async () => {
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const adaMember = await addMember(group.id, "Ada", ada.id);

    await removeMember(adaMember.id, group.id);

    expect(await isGroupOwner(group.id, ada.id)).toBe(false);
    expect(await findMemberForUser(group.id, ada.id)).toBeNull();

    await deleteGroup(group.id);
  });

  it("keeps a leaver's schedule, because it belongs to them and not the group", async () => {
    const sql = getDb();
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const adaMember = await addMember(group.id, "Ada", ada.id);
    await sql`
      INSERT INTO meetup.user_courses (user_id, term, class_number)
      VALUES (${ada.id}, ${TEST_GROUP.term}, '4321') ON CONFLICT DO NOTHING
    `;

    await removeMember(adaMember.id, group.id);

    const kept = await sql`
      SELECT class_number FROM meetup.user_courses WHERE user_id = ${ada.id} AND term = ${TEST_GROUP.term}
    `;
    expect(kept.map((r) => r.class_number)).toContain("4321");

    await deleteGroup(group.id);
  });
});

describe.skipIf(!hasKey)("deleting a group", () => {
  requireTestBranch();

  it("takes its members with it", async () => {
    const sql = getDb();
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    const member = await addMember(group.id, "Ada", ada.id);

    await deleteGroup(group.id);

    expect(await findGroup(group.code)).toBeNull();
    const left = await sql`SELECT id FROM meetup.members WHERE id = ${member.id}`;
    expect(left).toHaveLength(0);
  });

  it("does not take the user with it", async () => {
    const sql = getDb();
    const ada = await user("ada");
    const group = await createGroup(TEST_GROUP.name, TEST_GROUP.term, null);
    await addMember(group.id, "Ada", ada.id);

    await deleteGroup(group.id);

    const still = await sql`SELECT id FROM meetup.users WHERE id = ${ada.id}`;
    expect(still).toHaveLength(1);
  });
});
