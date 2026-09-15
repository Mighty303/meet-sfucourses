// Online is not on campus.
//
// Someone attending a lecture from their bedroom is busy, but they are not in a
// building anyone can walk to. Get this wrong in either direction and the grid
// lies: count them present and the group is told to meet someone who is at
// home; drop their hours entirely and a Zoom wedged between two campus classes
// gets offered as a free slot.
//
// The rules live in lib/overlap.ts — onCampus(), busyForMeetup() and
// anchorCampus() — and in STATUS_EFFECT. This file is what stops them being
// quietly undone.

import { describe, expect, it } from "vitest";
import { ATTENDANCE_STATUSES, STATUS_EFFECT } from "@/lib/attendance-status";
import {
  attending,
  availabilityBands,
  commonFree,
  onCampus,
  partialFree,
  type MemberSchedule,
} from "@/lib/overlap";
import { toMinutes } from "@/lib/sfu";
import { block, DAY_END, DAY_START, online, schedule, skipped } from "../fixtures/blocks";
import { PEOPLE } from "../fixtures/people";

const [ADA, BO, CY] = PEOPLE.map((p) => p.name);

const bands = (members: MemberSchedule[]) =>
  availabilityBands({ members, dayStart: DAY_START, dayEnd: DAY_END, days: ["Mo"] });
const windows = (members: MemberSchedule[], minMinutes = 60) =>
  commonFree({ members, dayStart: DAY_START, dayEnd: DAY_END, minMinutes, days: ["Mo"] });
const at = <T extends { start: number }>(list: T[], from: string) => list.find((b) => b.start === toMinutes(from));
/** The band covering a moment — bands merge, so one need not start there. */
const covering = <T extends { start: number; end: number }>(list: T[], when: string) => {
  const m = toMinutes(when);
  return list.find((b) => b.start <= m && b.end > m)!;
};

describe("a day of only online classes", () => {
  const remoteOnly = schedule(ADA, online("Mo", "09:00", "10:00"), online("Mo", "14:00", "15:00"));

  it("leaves them off campus, the same as a day with no classes", () => {
    const day = bands([remoteOnly, schedule(BO, block("Mo", "11:00", "12:00"))]);
    for (const band of day) {
      expect(band.awayIndices).toContain(0);
      expect(band.freeIndices).not.toContain(0);
      expect(band.busyIndices).not.toContain(0);
    }
  });

  it("is indistinguishable from having no classes at all", () => {
    const withZoom = bands([remoteOnly, schedule(BO, block("Mo", "11:00", "12:00"))]);
    const withNothing = bands([schedule(ADA), schedule(BO, block("Mo", "11:00", "12:00"))]);
    expect(withZoom).toEqual(withNothing);
  });

  it("does not put a campus on any band", () => {
    for (const band of bands([remoteOnly])) expect(band.campuses).toEqual([]);
  });

  it("does not block the hours everyone else is free", () => {
    // The bug this guards: Ada's 09:00 Zoom used to count as busy time for the
    // whole group, closing a window nobody was actually occupying.
    const roster = [
      schedule(BO, block("Mo", "08:30", "09:00"), block("Mo", "12:00", "13:00")),
      schedule(CY, block("Mo", "08:30", "09:00"), block("Mo", "12:00", "13:00")),
    ];
    const withoutAda = at(bands(roster), "09:00")!;
    const withAda = at(bands([...roster, remoteOnly]), "09:00")!;

    expect(withoutAda.freeIndices).toEqual([0, 1]);
    expect(withAda.freeIndices).toEqual([0, 1]); // Ada joins as away, not busy
    expect(withAda.awayIndices).toEqual([2]);
    expect(withAda.end).toBe(withoutAda.end); // and her 10:00 doesn't cut the band
  });

  it("is left off the names on a common free window", () => {
    const roster = [
      schedule(BO, block("Mo", "08:30", "09:00"), block("Mo", "12:00", "13:00")),
      schedule(CY, block("Mo", "08:30", "09:00"), block("Mo", "12:00", "13:00")),
      remoteOnly,
    ];
    const gap = at(windows(roster), "09:00")!;
    expect(gap.onCampus).toEqual([BO, CY]);
    expect(gap.onCampus).not.toContain(ADA);
  });
});

describe("a mixed day", () => {
  // On campus 09:00-10:00, Zoom 11:00-12:00, on campus 14:00-15:00.
  const mixed = schedule(
    ADA,
    block("Mo", "09:00", "10:00"),
    online("Mo", "11:00", "12:00"),
    block("Mo", "14:00", "15:00")
  );

  it("counts them as on campus", () => {
    const day = bands([mixed]);
    for (const band of day) expect(band.awayIndices).not.toContain(0);
    expect(at(day, "10:00")!.freeIndices).toContain(0);
  });

  it("still treats the online hour as busy, so it is never offered as a slot", () => {
    // The naive version of "ignore remote" breaks exactly here: she is on
    // campus but she cannot meet you at 11:00, she is in a lecture.
    expect(at(bands([mixed]), "11:00")!.busyIndices).toEqual([0]);
    expect(windows([mixed]).some((w) => w.start < toMinutes("12:00") && w.end > toMinutes("11:00"))).toBe(false);
  });

  it("anchors the surrounding free time to the campus she is actually standing on", () => {
    expect(at(bands([mixed]), "10:00")!.campuses).toEqual(["Burnaby"]);
  });
});

describe("when the day starts", () => {
  it("does not let an early Zoom pull someone's arrival forward", () => {
    // Ada's first commitment is a 09:00 lecture she takes from home; she does
    // not set foot on campus until 14:00. Counting her free from 10:00 would
    // offer the group a meetup she would have to travel in specially for —
    // which is the one thing this view is built not to do.
    const roster = [
      schedule(ADA, online("Mo", "09:00", "10:00"), block("Mo", "14:00", "15:00")),
      schedule(BO, block("Mo", "08:30", "09:00"), block("Mo", "16:00", "17:00")),
    ];
    const midday = covering(bands(roster), "10:00");
    expect(midday.outsideIndices).toContain(0);
    expect(midday.freeIndices).not.toContain(0);
    expect(midday.freeIndices).toContain(1); // Bo has been here since 08:30

    // Once she has actually arrived, she counts.
    expect(covering(bands(roster), "15:00").freeIndices).toContain(0);
  });
});

describe("anchorCampus ignores remote blocks", () => {
  it("anchors to a distant campus class rather than a nearby online one", () => {
    // The Zoom at 09:00-10:00 is nominally "at" Surrey and ends right where the
    // window opens, so on distance alone it would win. It must lose to the
    // Burnaby class six hours later, because that is the campus she will
    // actually be standing on — a campus nobody is at would split the group in
    // amber for nothing.
    const roster = [
      schedule(
        ADA,
        block("Mo", "08:00", "08:30"),
        online("Mo", "09:00", "10:00", { campus: "Surrey" }),
        block("Mo", "16:00", "17:00")
      ),
    ];
    const gap = at(bands(roster), "10:00")!;
    expect(gap.freeIndices).toEqual([0]);
    expect(gap.campuses).toEqual(["Burnaby"]);
    expect(gap.campuses).not.toContain("Surrey");
    expect(gap.sharedCampus).toBe(true);
  });

  it("does not let a remote block make a window look cross-campus", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(BO, block("Mo", "09:00", "10:00"), online("Mo", "11:00", "11:30", { campus: "Surrey" }), block("Mo", "12:00", "13:00")),
    ];
    for (const band of bands(roster)) expect(band.campuses).not.toContain("Surrey");
  });
});

describe("blocks with no campus at all", () => {
  it("never appear in a band's campus list", () => {
    // Three sources of campus: null — an online section (the API sends ""), a
    // section hit with no campus, and a custom busy block someone typed in.
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00", { campus: null, course: "Busy", detail: "" }), block("Mo", "12:00", "13:00", { campus: null })),
    ];
    for (const band of bands(roster)) expect(band.campuses).toEqual([]);
  });

  it("still count as busy — a custom block is time you are not free", () => {
    // campus: null with no remote status is someone blocking out their own
    // time, which must occupy the hour even though it anchors nothing.
    const busy = at(bands([schedule(ADA, block("Mo", "09:00", "10:00", { campus: null }))]), "09:00")!;
    expect(busy.busyIndices).toEqual([0]);
  });
});

describe("onCampus()", () => {
  const blocks = [
    block("Mo", "09:00", "10:00"),
    online("Mo", "11:00", "12:00"),
    skipped("Mo", "13:00", "14:00"),
  ];

  it("keeps only the classes that put someone in a building", () => {
    expect(onCampus(blocks)).toEqual([blocks[0]]);
  });

  it("is a subset of attending() — a skipped class is in neither", () => {
    expect(attending(blocks)).toEqual([blocks[0], blocks[1]]);
    for (const b of onCampus(blocks)) expect(attending(blocks)).toContain(b);
  });
});

describe("partialFree", () => {
  it("never names someone on campus who isn't among the attendees", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "13:00", "14:00")),
      schedule(BO, block("Mo", "09:00", "10:00"), block("Mo", "11:00", "12:30")),
      schedule(CY, online("Mo", "09:00", "16:00")),
    ];
    const some = partialFree({ members: roster, dayStart: DAY_START, dayEnd: DAY_END, minMinutes: 60, days: ["Mo"] });
    for (const w of some) {
      for (const name of w.onCampus) expect(w.attendees).toContain(name);
      expect(w.onCampus).not.toContain(CY); // remote all day
    }
  });
});

describe("STATUS_EFFECT is the source of truth", () => {
  it("says online is busy but not on campus", () => {
    expect(STATUS_EFFECT.remote).toMatchObject({ busy: true, onCampus: false });
  });

  it("says skipping is neither", () => {
    expect(STATUS_EFFECT.skipping).toMatchObject({ busy: false, onCampus: false });
  });

  it("says going is both", () => {
    expect(STATUS_EFFECT.going).toMatchObject({ busy: true, onCampus: true });
  });

  it("matches the CHECK constraint in db/migrations/008_attendance.sql", () => {
    // The column allows exactly these three; adding a fourth here without the
    // migration would fail at write time rather than at review time.
    expect([...ATTENDANCE_STATUSES]).toEqual(["going", "skipping", "remote"]);
    expect(Object.keys(STATUS_EFFECT).sort()).toEqual([...ATTENDANCE_STATUSES].sort());
  });
});
