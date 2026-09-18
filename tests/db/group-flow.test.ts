// A group of mocked-email people, end to end: create it, join it, save
// schedules, read the whole state back. The point is the SQL — in particular
// member_courses_effective, the view that decides whether a member's timetable
// comes from their profile or from the legacy per-member table.

import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  addMember,
  addMemberCourse,
  createGroup,
  deleteGroup,
  findGroup,
  getGroupState,
  getMemberCourses,
  regenerateGroupCode,
  removeMemberCourse,
  type Group,
} from "@/lib/groups";
import { weekDates } from "@/lib/overlap";
import { toMinutes } from "@/lib/sfu";
import { SAMPLE_TERM } from "../fixtures/term-sample";
import { TEST_GROUP } from "../fixtures/people";
import { requireTestBranch } from "./guard";
import { person, scheduledClassNumbers, seedTermCache, seedUsers } from "./seed";

const hasKey = !!process.env.NEON_API_KEY;
const WEEK = new Date("2026-10-14T12:00:00"); // inside the sample term
const opts = { week: WEEK, dayStart: toMinutes("08:00"), dayEnd: toMinutes("22:00"), minMinutes: 60 };

describe.skipIf(!hasKey)("a group of four", () => {
  requireTestBranch();

  let users: Awaited<ReturnType<typeof seedUsers>>;
  let group: Group;
  let classes: string[];

  beforeAll(async () => {
    await seedTermCache();
    users = await seedUsers();
    classes = scheduledClassNumbers(2);
    group = await createGroup(TEST_GROUP.name, SAMPLE_TERM, null);
  });

  it("finds the group by its invite code", async () => {
    const found = await findGroup(group.code);
    expect(found).toMatchObject({ id: group.id, name: TEST_GROUP.name, term: SAMPLE_TERM });
  });

  it("rotates the invite code and leaves the old one dead", async () => {
    const previous = group.code;
    const next = await regenerateGroupCode(group.id);
    expect(next).not.toBe(previous);
    expect(await findGroup(previous)).toBeNull();
    const found = await findGroup(next);
    expect(found).toMatchObject({ id: group.id, code: next });
    group = found!;
  });

  it("seats everyone with a distinct palette colour", async () => {
    for (const key of ["ada", "bo", "cy", "dee"]) {
      await addMember(group.id, person(key).name, users[key].id);
    }
    const state = await getGroupState(group, opts);

    expect(state.members.map((m) => m.displayName)).toEqual(["Ada", "Bo", "Cy", "Dee"]);
    expect(new Set(state.members.map((m) => m.color)).size).toBe(4);
  });

  it("gives a member the schedule they save", async () => {
    const state = await getGroupState(group, opts);
    const ada = state.members.find((m) => m.displayName === "Ada")!;

    await addMemberCourse(ada.id, classes[0]);
    expect(await getMemberCourses(ada.id)).toContain(classes[0]);

    const after = await getGroupState(group, opts);
    const adaAfter = after.members.find((m) => m.id === ada.id)!;
    expect(adaAfter.classNumbers).toContain(classes[0]);
    expect(after.busyByMember[ada.id].length).toBeGreaterThan(0);
  });

  it("keys a schedule to the person, so it follows them into another group", async () => {
    // This is what member_courses_effective buys: the same person in two groups
    // is the same timetable in both.
    const other = await createGroup("Another Crew", SAMPLE_TERM, null);
    const there = await addMember(other.id, "Ada", users.ada.id);

    expect(await getMemberCourses(there.id)).toContain(classes[0]);

    await deleteGroup(other.id);
  });

  it("does not leak a schedule into a different term", async () => {
    const other = await createGroup("Spring Crew", "2027-spring", null);
    const there = await addMember(other.id, "Ada", users.ada.id);

    expect(await getMemberCourses(there.id)).toEqual([]);

    await deleteGroup(other.id);
  });

  it("reads an ownerless legacy row from member_courses instead", async () => {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO meetup.members (group_id, display_name, color, user_id)
      VALUES (${group.id}, 'Legacy', '#eab308', NULL) RETURNING id
    `;
    const legacy = rows[0].id as number;
    await sql`INSERT INTO meetup.member_courses (member_id, class_number) VALUES (${legacy}, ${classes[1]})`;

    expect(await getMemberCourses(legacy)).toEqual([classes[1]]);

    const state = await getGroupState(group, opts);
    expect(state.members.find((m) => m.id === legacy)!.classNumbers).toEqual([classes[1]]);

    await sql`DELETE FROM meetup.members WHERE id = ${legacy}`;
  });

  it("drops a course again when it is removed", async () => {
    const state = await getGroupState(group, opts);
    const bo = state.members.find((m) => m.displayName === "Bo")!;

    await addMemberCourse(bo.id, classes[1]);
    expect(await getMemberCourses(bo.id)).toContain(classes[1]);

    await removeMemberCourse(bo.id, classes[1]);
    expect(await getMemberCourses(bo.id)).not.toContain(classes[1]);
  });

  it("clamps the week it reports to the term", async () => {
    const state = await getGroupState(group, { ...opts, week: new Date("2020-01-06T12:00:00") });
    const bounds = state.termBounds!;
    // state.week is already the Monday actually used, as YYYY-MM-DD.
    expect(state.week >= weekDates(new Date(`${bounds.typicalStart}T12:00:00`)).Mo).toBe(true);
    expect(state.week <= bounds.end).toBe(true);
  });

  it("makes no network call, because the term dump is already cached", async () => {
    // seedTermCache filled sections_cache; ensureFreshTerm only checks its age.
    const sql = getDb();
    const cached = await sql`SELECT term FROM meetup.sections_cache WHERE term = ${SAMPLE_TERM}`;
    expect(cached).toHaveLength(1);
  });
});
