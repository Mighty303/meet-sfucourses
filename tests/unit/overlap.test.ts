// The interval engine underneath every view: what is free, for whom, and when.
//
// Ported from the old scripts/check-engine.ts, which asserted most of this but
// reached the live sfucourses API to do it and so could not be run in CI. The
// property checks it made against real sections now live in tests/smoke.

import { describe, expect, it } from "vitest";
import {
  attending,
  blocksFromSection,
  busyFromCourses,
  clampWeekToTerm,
  commonFree,
  complement,
  intersectAll,
  intersectPair,
  mergeIntervals,
  partialFree,
  termBounds,
  unscheduledFromCourses,
  weekDates,
  type MemberSchedule,
} from "@/lib/overlap";
import { toMinutes } from "@/lib/sfu";
import { block, DAY_END, DAY_START, online, schedule, skipped } from "../fixtures/blocks";
import { SAMPLE_INDEX, TERM_SAMPLE } from "../fixtures/term-sample";
import { PEOPLE } from "../fixtures/people";

const [ADA, BO, CY] = PEOPLE.map((p) => p.name);
const mon = (opts: { members: MemberSchedule[]; minMinutes?: number; dayEnd?: number }) => ({
  members: opts.members,
  dayStart: DAY_START,
  dayEnd: opts.dayEnd ?? DAY_END,
  minMinutes: opts.minMinutes ?? 60,
  days: ["Mo"] as const,
});

describe("mergeIntervals", () => {
  it("collapses overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 60, end: 90 },
        { start: 80, end: 100 },
        { start: 100, end: 110 },
      ])
    ).toEqual([{ start: 60, end: 110 }]);
  });

  it("leaves a gap alone and sorts the result", () => {
    expect(
      mergeIntervals([
        { start: 200, end: 300 },
        { start: 60, end: 90 },
      ])
    ).toEqual([
      { start: 60, end: 90 },
      { start: 200, end: 300 },
    ]);
  });

  it("handles nothing", () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe("complement", () => {
  it("splits the day around a class", () => {
    expect(complement([{ start: 600, end: 660 }], { start: 480, end: 720 })).toEqual([
      { start: 480, end: 600 },
      { start: 660, end: 720 },
    ]);
  });

  it("returns the whole window when nothing is booked", () => {
    expect(complement([], { start: 480, end: 720 })).toEqual([{ start: 480, end: 720 }]);
  });

  it("returns nothing for a fully covered day", () => {
    expect(complement([{ start: 400, end: 800 }], { start: 480, end: 720 })).toEqual([]);
  });
});

describe("intersectPair / intersectAll", () => {
  it("keeps every overlapping fragment", () => {
    expect(
      intersectPair(
        [
          { start: 0, end: 100 },
          { start: 200, end: 300 },
        ],
        [{ start: 50, end: 250 }]
      )
    ).toEqual([
      { start: 50, end: 100 },
      { start: 200, end: 250 },
    ]);
  });

  it("narrows across three lists", () => {
    expect(
      intersectAll([[{ start: 0, end: 100 }], [{ start: 40, end: 90 }], [{ start: 50, end: 200 }]])
    ).toEqual([{ start: 50, end: 90 }]);
  });

  it("returns nothing when one list is empty", () => {
    expect(intersectAll([[{ start: 0, end: 100 }], []])).toEqual([]);
  });
});

describe("weekDates", () => {
  it("anchors on the Monday of the given week", () => {
    const dates = weekDates(new Date("2025-10-15T12:00:00"));
    expect(dates.Mo).toBe("2025-10-13");
    expect(dates.Su).toBe("2025-10-19");
  });

  it("treats Sunday as the end of the week it is in, not the start of the next", () => {
    expect(weekDates(new Date("2025-10-19T12:00:00")).Mo).toBe("2025-10-13");
  });
});

describe("attending", () => {
  it("drops skipped classes and keeps everything else", () => {
    const blocks = [block("Mo", "09:00", "10:00"), skipped("Mo", "11:00", "12:00"), online("Mo", "13:00", "14:00")];
    expect(attending(blocks)).toEqual([blocks[0], blocks[2]]);
  });

  it("treats a block with no status as going", () => {
    const b = block("Mo", "09:00", "10:00");
    expect(attending([b])).toEqual([b]);
  });
});

describe("busyFromCourses", () => {
  const dates = weekDates(new Date("2026-10-14T12:00:00")); // a week inside the sample term

  it("expands a real section into blocks inside the day", () => {
    const scheduled = [...SAMPLE_INDEX].find(([, hit]) =>
      hit.section.schedules.some((s) => s.days.trim() && s.startTime && s.startDate <= dates.Mo && s.endDate >= dates.Fr)
    )!;
    const blocks = busyFromCourses(SAMPLE_INDEX, [scheduled[0]], dates);

    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.end).toBeGreaterThan(b.start);
      expect(b.start).toBeGreaterThanOrEqual(0);
      expect(b.end).toBeLessThanOrEqual(24 * 60);
      expect(b.classNumber).toBe(scheduled[0]);
    }
  });

  it("skips class numbers it has never heard of", () => {
    expect(busyFromCourses(SAMPLE_INDEX, ["999999"], dates)).toEqual([]);
  });

  it("produces nothing for a week outside the section's dates", () => {
    const scheduled = [...SAMPLE_INDEX].find(([, hit]) => hit.section.schedules.some((s) => s.days.trim()))!;
    expect(busyFromCourses(SAMPLE_INDEX, [scheduled[0]], weekDates(new Date("2020-01-06T12:00:00")))).toEqual([]);
  });
});

describe("blocksFromSection", () => {
  it("draws a section from a search hit without a class-number lookup", () => {
    const hit = [...SAMPLE_INDEX].find(([, h]) => h.section.schedules.some((s) => s.days.trim() && s.startTime))![1];
    const blocks = blocksFromSection("CMPT 225", {
      classNumber: hit.section.classNumber,
      section: hit.section.section,
      deliveryMethod: hit.section.deliveryMethod,
      instructor: "",
      meetings: hit.section.schedules.map((s) => ({
        days: s.days,
        startTime: s.startTime,
        endTime: s.endTime,
        campus: s.campus,
        sectionCode: s.sectionCode,
      })),
    });
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.course).toBe("CMPT 225");
      expect(b.end).toBeGreaterThan(b.start);
    }
  });

  it("draws nothing for an async section", () => {
    expect(
      blocksFromSection("CMPT 300", {
        classNumber: "1234",
        section: "D100",
        deliveryMethod: "Online",
        instructor: "",
        meetings: [{ days: "", startTime: "", endTime: "", campus: "", sectionCode: "LEC" }],
      })
    ).toEqual([]);
  });

  it("marks a section with no campus as campus-less rather than empty-string", () => {
    const [b] = blocksFromSection("CMPT 300", {
      classNumber: "1234",
      section: "D100",
      deliveryMethod: "Online",
      instructor: "",
      meetings: [{ days: "Mo", startTime: "10:30", endTime: "11:20", campus: "", sectionCode: "LEC" }],
    });
    expect(b.campus).toBeNull();
  });
});

describe("unscheduledFromCourses", () => {
  it("picks out the sections that never meet", () => {
    const asyncNumbers = [...SAMPLE_INDEX]
      .filter(([, h]) => h.section.schedules.every((s) => !s.days.trim()))
      .map(([n]) => n);
    expect(asyncNumbers.length).toBeGreaterThan(0);

    const out = unscheduledFromCourses(SAMPLE_INDEX, asyncNumbers);
    expect(out.map((u) => u.classNumber).sort()).toEqual(asyncNumbers.slice().sort());
    for (const u of out) expect(u.course).toMatch(/^[A-Z]+ \w+$/);
  });

  it("leaves a section that does meet out of it", () => {
    const scheduled = [...SAMPLE_INDEX].find(([, h]) => h.section.schedules.some((s) => s.days.trim()))![0];
    expect(unscheduledFromCourses(SAMPLE_INDEX, [scheduled])).toEqual([]);
  });
});

describe("commonFree", () => {
  const gapRoster = [
    schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "11:30", "12:30")),
    schedule(BO, block("Mo", "09:30", "10:00"), block("Mo", "11:30", "13:00")),
    schedule(CY), // no class Monday
  ];

  it("finds the gap wedged between classes and marks it as one", () => {
    const wedged = commonFree(mon({ members: gapRoster })).filter((w) => w.betweenClasses);
    expect(wedged).toHaveLength(1);
    expect(wedged[0].start).toBe(toMinutes("10:00"));
    expect(wedged[0].end).toBe(toMinutes("11:30"));
  });

  it("leaves the member with no class that day off the on-campus list", () => {
    const wedged = commonFree(mon({ members: gapRoster })).find((w) => w.betweenClasses)!;
    expect(wedged.onCampus).toEqual([ADA, BO]);
  });

  it("keeps the people behind a campus split for the detailed tooltip", () => {
    const roster = [
      schedule("Burnaby one", block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule("Burnaby two", block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule("Burnaby three", block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule("Burnaby four", block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")),
      schedule("Surrey", block("Mo", "09:00", "10:00", { campus: "Surrey" }), block("Mo", "12:00", "13:00", { campus: "Surrey" })),
    ];
    const gap = commonFree({ members: roster, dayStart: DAY_START, dayEnd: toMinutes("13:00"), minMinutes: 60, days: ["Mo"] })
      .find((w) => w.start === toMinutes("10:00"))!;

    expect(gap.campusMembers).toEqual({
      Burnaby: ["Burnaby one", "Burnaby two", "Burnaby three", "Burnaby four"],
      Surrey: ["Surrey"],
    });
  });

  it("does not call the morning before the first class a gap", () => {
    const windows = commonFree(mon({ members: gapRoster }));
    expect(windows.some((w) => !w.betweenClasses && w.start === DAY_START)).toBe(true);
    expect(windows.some((w) => !w.betweenClasses && w.end === DAY_END)).toBe(true);
  });

  it("respects minMinutes", () => {
    for (const w of commonFree(mon({ members: gapRoster, minMinutes: 90 }))) {
      expect(w.end - w.start).toBeGreaterThanOrEqual(90);
    }
  });

  it("reports windows that really are free for everyone", () => {
    for (const w of commonFree(mon({ members: gapRoster }))) {
      for (const m of gapRoster) {
        for (const b of m.busy.filter((b) => b.day === w.day)) {
          expect(b.end <= w.start || b.start >= w.end).toBe(true);
        }
      }
    }
  });

  it("is driven to nothing by one member who is busy all day", () => {
    const blocked = [...gapRoster, schedule("always busy", block("Mo", "00:00", "23:59"))];
    expect(commonFree(mon({ members: blocked }))).toEqual([]);
  });

  it("searches weekdays only by default, but honours an explicit days list", () => {
    const week = commonFree({ members: gapRoster, dayStart: DAY_START, dayEnd: DAY_END, minMinutes: 60 });
    expect(week.some((w) => w.day === "Sa" || w.day === "Su")).toBe(false);

    const weekend = commonFree({ members: gapRoster, dayStart: DAY_START, dayEnd: DAY_END, minMinutes: 60, days: ["Sa"] });
    expect(weekend.every((w) => w.day === "Sa")).toBe(true);
  });

  it("returns nothing for an empty roster", () => {
    expect(commonFree(mon({ members: [] }))).toEqual([]);
  });
});

describe("partialFree", () => {
  // Capped at 13:00: past the last class everyone is trivially free, which
  // would hand the full group a window and defeat the point of the fixture.
  const trio = [
    schedule(ADA, block("Mo", "09:00", "10:00")),
    schedule(BO, block("Mo", "09:00", "12:00")),
    schedule(CY, block("Mo", "08:00", "10:00"), block("Mo", "12:00", "13:00")),
  ];
  const opts = mon({ members: trio, dayEnd: toMinutes("13:00") });

  it("finds a pair's window where the whole group has none", () => {
    expect(commonFree(opts)).toEqual([]);

    const some = partialFree(opts);
    expect(some.length).toBeGreaterThan(0);
    const pair = some.find((w) => w.start === toMinutes("10:00") && w.end === toMinutes("12:00"))!;
    expect(pair.attendees).toEqual([ADA, CY]);
    expect(pair.onCampus).toEqual([ADA, CY]);
    expect(pair.betweenClasses).toBe(true);
  });

  it("never reports a solo meetup", () => {
    for (const w of partialFree(opts)) expect(w.attendees.length).toBeGreaterThanOrEqual(2);
  });

  it("agrees with commonFree on the full-group windows", () => {
    const roster = [
      schedule(ADA, block("Mo", "09:00", "10:00"), block("Mo", "11:30", "12:30")),
      schedule(BO, block("Mo", "09:30", "10:00"), block("Mo", "11:30", "13:00")),
    ];
    const everyone = partialFree(mon({ members: roster })).filter((w) => w.everyone);
    const all = commonFree(mon({ members: roster }));
    expect(everyone.map((w) => `${w.day} ${w.start}-${w.end}`).sort()).toEqual(
      all.map((w) => `${w.day} ${w.start}-${w.end}`).sort()
    );
  });

  it("reports no window that is a fragment of another with the same crowd", () => {
    const some = partialFree(opts);
    for (const a of some) {
      for (const b of some) {
        if (a === b) continue;
        const sameCrowd =
          a.attendees.length === b.attendees.length && a.attendees.every((n) => b.attendees.includes(n));
        expect(sameCrowd && a.day === b.day && b.start <= a.start && b.end >= a.end).toBe(false);
      }
    }
  });

  it("reports nothing when minAttendees is above the group size", () => {
    expect(partialFree({ ...opts, minAttendees: 4 })).toEqual([]);
  });
});

describe("termBounds / clampWeekToTerm", () => {
  it("reads the real span out of the sample term", () => {
    const bounds = termBounds(TERM_SAMPLE)!;
    expect(bounds.start <= bounds.typicalStart).toBe(true);
    expect(bounds.typicalStart <= bounds.end).toBe(true);
    expect(bounds.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has no bounds to give for a term with nothing scheduled", () => {
    expect(termBounds([])).toBeNull();
  });

  it("pulls a week before the term forward and one after it back", () => {
    const bounds = termBounds(TERM_SAMPLE)!;
    const early = clampWeekToTerm(new Date("2020-01-06T12:00:00"), bounds);
    const late = clampWeekToTerm(new Date("2030-01-07T12:00:00"), bounds);
    expect(weekDates(early).Mo >= weekDates(new Date(`${bounds.typicalStart}T12:00:00`)).Mo).toBe(true);
    expect(weekDates(late).Mo <= bounds.end).toBe(true);
  });

  it("leaves a week already inside the term alone", () => {
    const bounds = termBounds(TERM_SAMPLE)!;
    const inside = new Date("2026-10-14T12:00:00");
    expect(clampWeekToTerm(inside, bounds).getTime()).toBe(inside.getTime());
  });

  it("leaves any week alone when there are no bounds", () => {
    const week = new Date("2026-10-14T12:00:00");
    expect(clampWeekToTerm(week, null).getTime()).toBe(week.getTime());
  });
});
