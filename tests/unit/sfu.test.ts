// The parsing and search helpers around the sfucourses API, checked against a
// committed slice of a real term dump rather than invented data — the awkward
// shapes (empty campus, no days at all, three meetings a week) are the ones SFU
// actually publishes.

import { describe, expect, it } from "vitest";
import {
  coursesByClassNumbers,
  currentTermCode,
  formatTime,
  fromMinutes,
  fromTermCode,
  parseDays,
  searchCourses,
  toMinutes,
  toTermCode,
} from "@/lib/sfu";
import { SAMPLE_INDEX, TERM_SAMPLE } from "../fixtures/term-sample";

describe("time helpers", () => {
  it("converts to and from minutes", () => {
    expect(toMinutes("10:30")).toBe(630);
    expect(fromMinutes(630)).toBe("10:30");
    expect(fromMinutes(toMinutes("08:05"))).toBe("08:05");
  });

  it("formats a 12-hour label, including the two that catch people out", () => {
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(12 * 60)).toBe("12:00 PM");
    expect(formatTime(810)).toBe("1:30 PM");
    expect(formatTime(23 * 60 + 59)).toBe("11:59 PM");
  });

  it("parses every start and end time in the sample", () => {
    for (const course of TERM_SAMPLE) {
      for (const s of course.sections) {
        for (const sched of s.schedules) {
          if (!sched.startTime) continue;
          expect(Number.isFinite(toMinutes(sched.startTime))).toBe(true);
          expect(toMinutes(sched.endTime)).toBeGreaterThan(toMinutes(sched.startTime));
        }
      }
    }
  });
});

describe("parseDays", () => {
  it("splits a day list", () => {
    expect(parseDays("Mo, We")).toEqual(["Mo", "We"]);
    expect(parseDays("Mo, We, Fr")).toEqual(["Mo", "We", "Fr"]);
  });

  it("gives an async section no days", () => {
    expect(parseDays("")).toEqual([]);
  });

  it("drops anything that isn't a day key", () => {
    expect(parseDays("Mo, XX, Fr")).toEqual(["Mo", "Fr"]);
  });

  it("parses every day string in the sample", () => {
    for (const course of TERM_SAMPLE) {
      for (const s of course.sections) {
        for (const sched of s.schedules) {
          expect(parseDays(sched.days).length).toBe(sched.days.split(",").filter((d) => d.trim()).length);
        }
      }
    }
  });
});

describe("term codes", () => {
  it("round-trips a label", () => {
    expect(toTermCode("Fall 2025")).toBe("2025-fall");
    expect(fromTermCode("2025-fall")).toBe("Fall 2025");
    expect(fromTermCode(toTermCode("Summer 2026"))).toBe("Summer 2026");
  });

  it("puts each month in the right SFU term", () => {
    const on = (iso: string) => currentTermCode(new Date(`${iso}T12:00:00`));
    expect(on("2026-01-05")).toBe("2026-spring");
    expect(on("2026-04-30")).toBe("2026-spring"); // April is still spring
    expect(on("2026-05-01")).toBe("2026-summer");
    expect(on("2026-08-31")).toBe("2026-summer"); // August is still summer
    expect(on("2026-09-01")).toBe("2026-fall");
    expect(on("2026-12-31")).toBe("2026-fall");
  });
});

describe("indexByClassNumber", () => {
  it("indexes every section in the dump", () => {
    const sections = TERM_SAMPLE.reduce((n, c) => n + c.sections.length, 0);
    expect(SAMPLE_INDEX.size).toBe(sections);
  });

  it("points a class number at its own course and section", () => {
    const [classNumber, hit] = [...SAMPLE_INDEX][0];
    expect(hit.section.classNumber).toBe(classNumber);
    expect(hit.course.sections).toContain(hit.section);
  });
});

describe("searchCourses", () => {
  it("ranks an exact code above a prefix match", () => {
    const hits = searchCourses(TERM_SAMPLE, "CMPT 120");
    expect(`${hits[0].dept} ${hits[0].number}`).toBe("CMPT 120");
  });

  it("finds a course however the code is typed", () => {
    for (const q of ["cmpt 120", "CMPT120", "cmpt120"]) {
      expect(`${searchCourses(TERM_SAMPLE, q)[0].dept} ${searchCourses(TERM_SAMPLE, q)[0].number}`).toBe("CMPT 120");
    }
  });

  it("falls back to the title", () => {
    const hits = searchCourses(TERM_SAMPLE, "general biology");
    expect(hits.some((h) => h.title.toLowerCase().includes("general biology"))).toBe(true);
  });

  it("refuses a query too short to mean anything", () => {
    expect(searchCourses(TERM_SAMPLE, "c")).toEqual([]);
    expect(searchCourses(TERM_SAMPLE, "")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchCourses(TERM_SAMPLE, "cmpt", 2)).toHaveLength(2);
  });

  it("sorts a dept search by course number, not by string", () => {
    const numbers = searchCourses(TERM_SAMPLE, "cmpt", 50).map((h) => h.number);
    const sorted = numbers.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    expect(numbers).toEqual(sorted);
  });

  it("slims a hit down to what the picker shows", () => {
    const [hit] = searchCourses(TERM_SAMPLE, "cmpt 120");
    for (const s of hit.sections) {
      expect(Object.keys(s).sort()).toEqual(
        ["classNumber", "deliveryMethod", "instructor", "meetings", "section"].sort()
      );
    }
  });
});

describe("coursesByClassNumbers", () => {
  it("returns only the sections asked for", () => {
    const [classNumber, hit] = [...SAMPLE_INDEX][0];
    const out = coursesByClassNumbers(TERM_SAMPLE, [classNumber]);
    expect(out).toHaveLength(1);
    expect(out[0].dept).toBe(hit.course.dept);
    expect(out[0].sections.map((s) => s.classNumber)).toEqual([classNumber]);
  });

  it("skips a class number it doesn't know", () => {
    // Usually a section saved under a different term; the group page flags it.
    expect(coursesByClassNumbers(TERM_SAMPLE, ["999999"])).toEqual([]);
  });

  it("returns nothing when asked for nothing", () => {
    expect(coursesByClassNumbers(TERM_SAMPLE, [])).toEqual([]);
  });
});

describe("the sample fixture itself", () => {
  it("still covers the shapes the parsers have to survive", () => {
    const sections = TERM_SAMPLE.flatMap((c) => c.sections);
    const schedules = sections.flatMap((s) => s.schedules);

    expect(sections.some((s) => s.schedules.every((x) => !x.days.trim()))).toBe(true); // async
    expect(schedules.some((x) => x.days.trim() && !x.campus.trim())).toBe(true); // online
    expect(sections.some((s) => s.schedules.length > 1)).toBe(true); // LEC + LAB
    expect(new Set(schedules.map((x) => x.campus).filter(Boolean)).size).toBeGreaterThan(1);
    expect(sections.every((s) => /^\d{3,6}$/.test(s.classNumber))).toBe(true);
  });
});
