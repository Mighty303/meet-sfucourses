// Attendance through the database, and the rule that matters most on the way
// back out: a class someone attends from home must not put them on campus.
//
// The unit suite proves that about the overlap maths in isolation. This proves
// it survives the whole path — a row written to Postgres, resolved by
// resolveStatus inside getGroupState, stamped onto a block, and read by
// availabilityBands.

import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { clearAttendance, hasDayStatus, listAttendance, setAttendance } from "@/lib/attendance";
import { addMember, addMemberCourse, createGroup, deleteGroup, getGroupState, type Group } from "@/lib/groups";
import { availabilityBands, weekDates } from "@/lib/overlap";
import { toMinutes, type DayKey } from "@/lib/sfu";
import { SAMPLE_TERM } from "../fixtures/term-sample";
import { requireTestBranch } from "./guard";
import { person, scheduledClassNumbers, seedTermCache, seedUsers } from "./seed";

const hasKey = !!process.env.NEON_API_KEY;
const WEEK = new Date("2026-10-14T12:00:00");
const DATES = weekDates(WEEK);
const opts = { week: WEEK, dayStart: toMinutes("08:00"), dayEnd: toMinutes("22:00"), minMinutes: 60 };

describe.skipIf(!hasKey)("writing attendance", () => {
  requireTestBranch();

  let users: Awaited<ReturnType<typeof seedUsers>>;

  beforeAll(async () => {
    users = await seedUsers();
  });

  it("stores and reads back a whole-day status", async () => {
    await setAttendance(users.ada.id, DATES.Mo, null, "skipping", "sick");
    const rows = await listAttendance([users.ada.id], DATES.Mo, DATES.Su);

    expect(rows).toContainEqual(
      expect.objectContaining({ userId: users.ada.id, onDate: DATES.Mo, classNumber: null, status: "skipping", note: "sick" })
    );
    expect(await hasDayStatus(users.ada.id, DATES.Mo)).toBe(true);

    await clearAttendance(users.ada.id, DATES.Mo, null);
    expect(await hasDayStatus(users.ada.id, DATES.Mo)).toBe(false);
  });

  it("keeps one row per day, updating rather than duplicating", async () => {
    // The partial unique index on (user_id, on_date) WHERE class_number IS NULL
    // is what makes this an upsert instead of a pile.
    await setAttendance(users.bo.id, DATES.Tu, null, "skipping", null);
    await setAttendance(users.bo.id, DATES.Tu, null, "remote", "zoom");

    const rows = (await listAttendance([users.bo.id], DATES.Tu, DATES.Tu)).filter((r) => r.classNumber === null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "remote", note: "zoom" });

    await clearAttendance(users.bo.id, DATES.Tu, null);
  });

  it("keeps one row per class per day, separate from the day row", async () => {
    // Two partial indexes, because NULL <> NULL would let unbounded whole-day
    // rows through a single one.
    await setAttendance(users.cy.id, DATES.We, null, "skipping", null);
    await setAttendance(users.cy.id, DATES.We, "1234", "remote", null);
    await setAttendance(users.cy.id, DATES.We, "1234", "going", null);

    const rows = await listAttendance([users.cy.id], DATES.We, DATES.We);
    expect(rows.filter((r) => r.classNumber === null)).toHaveLength(1);
    expect(rows.filter((r) => r.classNumber === "1234")).toHaveLength(1);

    await clearAttendance(users.cy.id, DATES.We, null);
    await clearAttendance(users.cy.id, DATES.We, "1234");
  });

  it("refuses a status the column does not allow", async () => {
    const sql = getDb();
    await expect(
      sql`INSERT INTO meetup.attendance (user_id, on_date, class_number, status)
          VALUES (${users.dee.id}, ${DATES.Th}::date, NULL, 'maybe')`
    ).rejects.toThrow();
  });

  it("does not answer for another person or another day", async () => {
    await setAttendance(users.ada.id, DATES.Fr, null, "remote", null);

    expect(await hasDayStatus(users.bo.id, DATES.Fr)).toBe(false);
    expect(await hasDayStatus(users.ada.id, DATES.Th)).toBe(false);

    await clearAttendance(users.ada.id, DATES.Fr, null);
  });
});

describe.skipIf(!hasKey)("online is not on campus, end to end", () => {
  requireTestBranch();

  let users: Awaited<ReturnType<typeof seedUsers>>;
  let group: Group;
  let memberIds: Record<string, number>;
  let day: DayKey;

  beforeAll(async () => {
    await seedTermCache();
    users = await seedUsers();
    group = await createGroup("Remote Crew", SAMPLE_TERM, null);

    const classes = scheduledClassNumbers(1);
    memberIds = {};
    for (const key of ["ada", "bo"]) {
      const m = await addMember(group.id, person(key).name, users[key].id);
      memberIds[key] = m.id;
      await addMemberCourse(m.id, classes[0]);
    }

    // Whichever weekday that shared section actually meets on.
    const state = await getGroupState(group, opts);
    day = state.busyByMember[memberIds.ada][0].day;
  });

  it("starts with both of them on campus and busy together", async () => {
    const state = await getGroupState(group, opts);
    const members = ["ada", "bo"].map((k) => ({
      name: k,
      busy: state.busyByMember[memberIds[k]],
    }));

    const bands = availabilityBands({ members, dayStart: opts.dayStart, dayEnd: opts.dayEnd, days: [day] });
    expect(bands.some((b) => b.busyIndices.length === 2)).toBe(true);
    expect(bands.every((b) => b.awayIndices.length === 0)).toBe(true);
  });

  it("takes Ada off campus for the day once she marks it online", async () => {
    await setAttendance(users.ada.id, dateOf(day), null, "remote", null);

    const state = await getGroupState(group, opts);
    // The status reached the block through resolveStatus, not through the grid.
    //
    // Only the blocks on that date: a whole-day row is about one day, and the
    // fixture's first scheduled section meets twice a week (ARCH 200 D100, Tu
    // and Fr), so the rest of the week is still "going" — which is the point
    // of keying attendance on a date rather than on a weekday.
    const onDay = state.busyByMember[memberIds.ada].filter((b) => b.day === day);
    expect(onDay.length).toBeGreaterThan(0);
    expect(onDay.every((b) => b.status === "remote")).toBe(true);

    const members = ["ada", "bo"].map((k) => ({ name: k, busy: state.busyByMember[memberIds[k]] }));
    const bands = availabilityBands({ members, dayStart: opts.dayStart, dayEnd: opts.dayEnd, days: [day] });

    for (const band of bands) {
      expect(band.awayIndices).toContain(0); // Ada: attending, but from home
      expect(band.freeIndices).not.toContain(0);
      expect(band.busyIndices).not.toContain(0);
    }
    // ...and she anchors nobody to a campus she isn't standing on.
    expect(bands.flatMap((b) => b.campuses)).not.toContain("");

    await clearAttendance(users.ada.id, dateOf(day), null);
  });

  it("puts her back on campus when the status is cleared", async () => {
    const state = await getGroupState(group, opts);
    expect(state.busyByMember[memberIds.ada].every((b) => b.status === "going")).toBe(true);

    const members = ["ada", "bo"].map((k) => ({ name: k, busy: state.busyByMember[memberIds[k]] }));
    const bands = availabilityBands({ members, dayStart: opts.dayStart, dayEnd: opts.dayEnd, days: [day] });
    expect(bands.every((b) => b.awayIndices.length === 0)).toBe(true);
  });

  it("frees the hour outright when she says she is skipping", async () => {
    await setAttendance(users.ada.id, dateOf(day), null, "skipping", null);

    const state = await getGroupState(group, opts);
    const members = ["ada", "bo"].map((k) => ({ name: k, busy: state.busyByMember[memberIds[k]] }));
    const bands = availabilityBands({ members, dayStart: opts.dayStart, dayEnd: opts.dayEnd, days: [day] });

    // Skipping is not the same as online: she is not in the lecture at all, so
    // she has no class that day and is away rather than busy.
    for (const band of bands) expect(band.busyIndices).not.toContain(0);

    await clearAttendance(users.ada.id, dateOf(day), null);
    await deleteGroup(group.id);
  });
});

/** The YYYY-MM-DD the displayed week puts that weekday on. */
function dateOf(day: DayKey): string {
  return DATES[day];
}
