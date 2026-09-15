// The heat map. `availabilityBands` produces the bands and `fillAlpha` turns a
// count into the green — together they are the entire reading of that view, and
// until now neither had a test.

import { describe, expect, it } from "vitest";
import { availabilityBands, type AvailabilityBand, type MemberSchedule } from "@/lib/overlap";
import { fillAlpha } from "@/lib/heat-fill";
import { toMinutes, WEEKDAYS } from "@/lib/sfu";
import { block, DAY_END, DAY_START, schedule, skipped } from "../fixtures/blocks";
import { PEOPLE } from "../fixtures/people";

const [ADA, BO, CY, DEE] = PEOPLE.map((p) => p.name);

function bands(members: MemberSchedule[], opts: { days?: readonly ("Mo" | "Tu" | "We" | "Th" | "Fr")[] } = {}) {
  return availabilityBands({ members, dayStart: DAY_START, dayEnd: DAY_END, days: opts.days ?? ["Mo"] });
}

const at = (list: AvailabilityBand[], from: string) => list.find((b) => b.start === toMinutes(from));

describe("availabilityBands — structural invariants", () => {
  const roster = [
    schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "13:30", "14:20")),
    schedule(BO, block("Mo", "09:30", "10:20"), block("Mo", "11:00", "12:00")),
    schedule(CY, block("Mo", "14:00", "15:00")),
    schedule(DEE), // nothing on Monday at all
  ];

  it("classifies every member exactly once in every band", () => {
    // busyIndices is computed as the complement of the other three, so any
    // misclassification anywhere shows up as a gap or a double-count here.
    for (const band of bands(roster)) {
      const all = [...band.freeIndices, ...band.busyIndices, ...band.awayIndices, ...band.outsideIndices];
      expect(all.slice().sort()).toEqual(roster.map((_, i) => i));
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("cuts only at real class edges, never on a clock grid", () => {
    const edges = new Set([DAY_START, DAY_END]);
    for (const m of roster) {
      for (const b of m.busy) {
        edges.add(b.start);
        edges.add(b.end);
      }
    }

    for (const band of bands(roster)) {
      expect(edges.has(band.start)).toBe(true);
      expect(edges.has(band.end)).toBe(true);
    }
    // 10:00 is a real edge (Ada's class ends); 10:30 is not anyone's.
    const starts = bands(roster).map((b) => b.start);
    expect(starts).toContain(toMinutes("10:00"));
    expect(starts).not.toContain(toMinutes("10:30"));
  });

  it("produces bands that tile the day without gaps or overlap", () => {
    const day = bands(roster);
    expect(day[0].start).toBe(DAY_START);
    expect(day[day.length - 1].end).toBe(DAY_END);
    for (let i = 1; i < day.length; i++) expect(day[i].start).toBe(day[i - 1].end);
  });

  it("leaves an empty roster with nobody in any bucket", () => {
    // Unlike commonFree, availabilityBands has no zero-member guard: it emits
    // one band for the whole day with every list empty. Harmless — fillAlpha
    // renders that transparent — but pinned here so the shape can't drift.
    const empty = bands([]);
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ start: DAY_START, end: DAY_END, freeIndices: [], busyIndices: [], awayIndices: [], outsideIndices: [] });
    expect(fillAlpha(empty[0].freeIndices.length, 0)).toBe(0);
  });

  it("covers Mon–Fri by default", () => {
    const all = availabilityBands({ members: roster, dayStart: DAY_START, dayEnd: DAY_END });
    expect([...new Set(all.map((b) => b.day))]).toEqual([...WEEKDAYS]);
  });
});

describe("availabilityBands — merging", () => {
  it("does not split a band where one class ends exactly as another begins", () => {
    // Ada is in class 09:00-10:20 then 10:20-11:30 back to back. 10:20 is a cut
    // point, but nobody's free set changes there, so it must stay one band.
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:20"), block("Mo", "10:20", "11:30")),
      schedule(BO, block("Mo", "09:00", "11:30")),
    ];
    const busyThrough = bands(roster).filter(
      (b) => b.start >= toMinutes("09:00") && b.end <= toMinutes("11:30")
    );
    expect(busyThrough).toHaveLength(1);
    expect(busyThrough[0].busyIndices).toEqual([0, 1]);
  });
});

describe("availabilityBands — arriving and leaving", () => {
  const roster = [
    schedule(ADA, block("Mo", "12:00", "13:00")),
    schedule(BO, block("Mo", "09:00", "10:00")),
  ];

  it("does not count someone as free before their own first class", () => {
    // Ada's day starts at noon. At 09:00 she is at home, not free on campus —
    // otherwise every quiet morning lights the grid up.
    const morning = at(bands(roster), "08:00")!;
    expect(morning.outsideIndices).toContain(0);
    expect(morning.freeIndices).not.toContain(0);
  });

  it("keeps someone free after their own last class while the day is still going", () => {
    // Bo is out at 10:00 but Ada's class runs to 13:00. Bo is standing on
    // campus with an hour to kill — that is the meetup this view is for.
    const gap = at(bands(roster), "10:00")!;
    expect(gap.freeIndices).toContain(1);
  });

  it("puts everyone outside once the last class of the day is over", () => {
    const evening = at(bands(roster), "13:00")!;
    expect(evening.freeIndices).toEqual([]);
    expect(evening.outsideIndices.slice().sort()).toEqual([0, 1]);
  });
});

describe("availabilityBands — away", () => {
  it("never counts a member with no class that day as free", () => {
    const roster = [schedule(ADA, block("Mo", "09:00", "10:00")), schedule(DEE)];
    for (const band of bands(roster)) {
      expect(band.awayIndices).toContain(1);
      expect(band.freeIndices).not.toContain(1);
    }
  });

  it("leaves a day nobody attends with no free time at all", () => {
    const roster = [schedule(ADA), schedule(BO)];
    for (const band of bands(roster)) {
      expect(band.awayIndices.slice().sort()).toEqual([0, 1]);
      expect(band.freeIndices).toEqual([]);
    }
  });
});

describe("availabilityBands — campus", () => {
  it("reports one campus and sharedCampus when the group is in one place", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(BO, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
    ];
    const gap = at(bands(roster), "10:00")!;
    expect(gap.freeIndices).toEqual([0, 1]);
    expect(gap.campuses).toEqual(["Burnaby"]);
    expect(gap.sharedCampus).toBe(true);
  });

  it("flags a band where the free members are anchored to different campuses", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(BO, block("Mo", "09:00", "10:00", { campus: "Surrey" }), block("Mo", "12:00", "13:00", { campus: "Surrey" })),
    ];
    const gap = at(bands(roster), "10:00")!;
    expect(gap.campuses.slice().sort()).toEqual(["Burnaby", "Surrey"]);
    expect(gap.sharedCampus).toBe(false);
  });

  it("keeps sharedCampus in step with the campus list in every band", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(BO, block("Mo", "10:30", "11:30", { campus: "Surrey" })),
    ];
    for (const band of bands(roster)) expect(band.sharedCampus).toBe(band.campuses.length <= 1);
  });
});

describe("availabilityBands — attendance", () => {
  it("opens a band where a class has been marked skipped", () => {
    const going = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "10:00", "11:00"), block("Mo", "13:00", "14:00")),
      schedule(BO, block("Mo", "09:00", "10:00"), block("Mo", "13:00", "14:00")),
    ];
    expect(at(bands(going), "10:00")!.freeIndices).toEqual([1]);

    const skipping = [
      schedule(ADA, block("Mo", "09:00", "10:00"), skipped("Mo", "10:00", "11:00"), block("Mo", "13:00", "14:00")),
      going[1],
    ];
    // The skipped hour stops occupying Ada's time, so the band is now both of
    // them — which is the whole point of saying you aren't going.
    expect(at(bands(skipping), "10:00")!.freeIndices).toEqual([0, 1]);
  });
});

describe("fillAlpha", () => {
  it("leaves an empty band fully transparent", () => {
    // Deliberate: 0 must read as the paper, not as a very pale green.
    expect(fillAlpha(0, 5)).toBe(0);
  });

  it("guards against an empty roster", () => {
    expect(fillAlpha(0, 0)).toBe(0);
    expect(fillAlpha(3, 0)).toBe(0);
  });

  it("tops out at 0.85 when everyone is free", () => {
    expect(fillAlpha(5, 5)).toBeCloseTo(0.85, 10);
    expect(fillAlpha(1, 1)).toBeCloseTo(0.85, 10);
  });

  it("keeps one person out of eight visible", () => {
    expect(fillAlpha(1, 8)).toBeGreaterThanOrEqual(0.12);
  });

  it("increases strictly with the number free", () => {
    const ramp = [1, 2, 3, 4, 5].map((n) => fillAlpha(n, 5));
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  });

  it("depends only on the ratio, so a band reads the same in any group size", () => {
    expect(fillAlpha(1, 2)).toBeCloseTo(fillAlpha(3, 6), 10);
  });
});

describe("the heat map's denominator", () => {
  it("excludes members with nothing saved, as HeatGrid does before calling in", () => {
    // HeatGrid filters `withSchedules` before building bands. Reproduced here
    // because the filter is what stops an empty roster washing the week green:
    // drop it and `total` grows while `free` cannot, so every band goes pale.
    const members = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(BO, block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule(DEE), // saved no courses at all
    ];
    const withSchedules = members.filter((m) => m.busy.length > 0);
    expect(withSchedules).toHaveLength(2);

    const gap = at(bands(withSchedules), "10:00")!;
    expect(fillAlpha(gap.freeIndices.length, withSchedules.length)).toBeCloseTo(0.85, 10);
    expect(fillAlpha(gap.freeIndices.length, members.length)).toBeLessThan(0.85);
  });
});
