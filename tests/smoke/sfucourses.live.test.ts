// Against the live sfucourses API. Opt-in (`npm run test:smoke`), because it is
// somebody else's server and `npm test` must never depend on it.
//
// The job is catching schema drift, not asserting data. SFU renaming a field or
// dropping one is the failure worth a red build; SFU opening a new campus is
// not, so unknown *values* are reported and known *shapes* are enforced.

import { beforeAll, describe, expect, it } from "vitest";
import {
  busyFromCourses,
  termBounds,
  weekDates,
  type BusyBlock,
} from "@/lib/overlap";
import {
  currentTermCode,
  fetchTermSections,
  indexByClassNumber,
  parseDays,
  searchCourses,
  toMinutes,
  type CourseWithSections,
} from "@/lib/sfu";

// What the app has seen before. An unknown value warns; it does not fail.
const KNOWN_CAMPUSES = new Set(["", "Burnaby", "Surrey", "Vancouver", "SEGAL", "GOLDCORP", "DT VSAR"]);
const KNOWN_DELIVERY = new Set(["", "In Person", "Online", "Blended", "Hybrid"]);

const TERM = currentTermCode();
let courses: CourseWithSections[];
let index: ReturnType<typeof indexByClassNumber>;

beforeAll(async () => {
  try {
    courses = await fetchTermSections(TERM);
  } catch (err) {
    throw new Error(
      `could not reach api.sfucourses.com for ${TERM} — these tests need the network. ${String(err)}`
    );
  }
  index = indexByClassNumber(courses);
  console.log(`${TERM}: ${courses.length} courses, ${index.size} sections`);
});

describe("the term endpoint", () => {
  it("answers with a non-empty list of courses for the current term", () => {
    expect(Array.isArray(courses)).toBe(true);
    expect(courses.length).toBeGreaterThan(100);
  });

  it("rejects a term that does not exist, rather than answering with junk", async () => {
    await expect(fetchTermSections("1999-winter")).rejects.toThrow();
  });
});

describe("the course shape", () => {
  it("still has every field CourseWithSections declares", () => {
    for (const c of courses) {
      expect(typeof c.dept).toBe("string");
      expect(typeof c.number).toBe("string");
      expect(typeof c.title).toBe("string");
      expect(typeof c.units).toBe("string");
      expect(typeof c.term).toBe("string");
      expect(Array.isArray(c.sections)).toBe(true);
    }
  });

  it("still has every field SectionDetail declares", () => {
    for (const s of courses.flatMap((c) => c.sections)) {
      expect(typeof s.section).toBe("string");
      expect(typeof s.deliveryMethod).toBe("string");
      expect(typeof s.classNumber).toBe("string");
      expect(Array.isArray(s.instructors)).toBe(true);
      expect(Array.isArray(s.schedules)).toBe(true);
    }
  });

  it("still has all seven fields SectionSchedule declares", () => {
    const want = ["startDate", "endDate", "campus", "days", "startTime", "endTime", "sectionCode"];
    for (const sched of courses.flatMap((c) => c.sections).flatMap((s) => s.schedules)) {
      for (const field of want) {
        expect(sched, `missing ${field}`).toHaveProperty(field);
        expect(typeof sched[field as keyof typeof sched]).toBe("string");
      }
    }
  });

  it("keeps class numbers within the shape the API route validates", () => {
    // app/api/groups/[code]/members/[memberId]/courses/route.ts enforces this
    // before it will store one, so a wider upstream format locks people out.
    const bad = [...index.keys()].filter((n) => !/^\d{3,6}$/.test(n));
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("gives every section a unique class number", () => {
    const all = courses.flatMap((c) => c.sections).map((s) => s.classNumber);
    expect(index.size).toBe(new Set(all).size);
  });
});

describe("values the app branches on", () => {
  it("uses campus names it has seen before", () => {
    const seen = new Set(
      courses.flatMap((c) => c.sections).flatMap((s) => s.schedules).map((x) => x.campus)
    );
    const novel = [...seen].filter((x) => !KNOWN_CAMPUSES.has(x));
    if (novel.length) console.warn(`new campus value(s) from SFU: ${JSON.stringify(novel)}`);
    // Not a failure — but the field must still be a string on every row.
    for (const x of seen) expect(typeof x).toBe("string");
  });

  it("uses delivery methods it has seen before", () => {
    const seen = new Set(courses.flatMap((c) => c.sections).map((s) => s.deliveryMethod));
    const novel = [...seen].filter((x) => !KNOWN_DELIVERY.has(x));
    if (novel.length) console.warn(`new deliveryMethod value(s) from SFU: ${JSON.stringify(novel)}`);
    for (const x of seen) expect(typeof x).toBe("string");
  });

  it("still publishes day strings the parser understands", () => {
    for (const sched of courses.flatMap((c) => c.sections).flatMap((s) => s.schedules)) {
      const tokens = sched.days.split(",").map((d) => d.trim()).filter(Boolean);
      expect(parseDays(sched.days)).toHaveLength(tokens.length);
    }
  });

  it("still publishes sections that never meet, so the async path stays real", () => {
    const asyncSections = courses
      .flatMap((c) => c.sections)
      .filter((s) => s.schedules.every((x) => !x.days.trim()));
    expect(asyncSections.length).toBeGreaterThan(0);
  });

  it("still publishes sections with no campus, which is what online looks like", () => {
    const online = courses
      .flatMap((c) => c.sections)
      .flatMap((s) => s.schedules)
      .filter((x) => x.days.trim() && !x.campus.trim());
    expect(online.length).toBeGreaterThan(0);
  });

  it("dates every schedule as YYYY-MM-DD, which the code compares as strings", () => {
    for (const sched of courses.flatMap((c) => c.sections).flatMap((s) => s.schedules)) {
      expect(sched.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sched.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sched.startDate <= sched.endDate).toBe(true);
    }
  });

  it("times every meeting as HH:MM, ending after it starts", () => {
    for (const sched of courses.flatMap((c) => c.sections).flatMap((s) => s.schedules)) {
      if (!sched.startTime) continue;
      expect(sched.startTime).toMatch(/^\d{1,2}:\d{2}$/);
      expect(toMinutes(sched.endTime)).toBeGreaterThan(toMinutes(sched.startTime));
    }
  });
});

describe("the engine against real sections", () => {
  it("expands real timetables into blocks that sit inside the day", () => {
    const bounds = termBounds(courses)!;
    // Three weeks in, not the first week: the Monday of the week *containing*
    // the term start is usually before classes begin, so the date-range gate in
    // busyFromCourses would drop everything.
    const third = new Date(`${bounds.typicalStart}T12:00:00`);
    third.setDate(third.getDate() + 21);
    const dates = weekDates(third);

    const picks = [...index]
      .filter(([, { section }]) =>
        section.schedules.some(
          (s) => s.days.trim() && s.campus.trim() && s.startDate <= dates.Mo && s.endDate >= dates.Fr
        )
      )
      .slice(0, 3)
      .map(([classNumber]) => classNumber);
    expect(picks).toHaveLength(3);

    const blocks: BusyBlock[] = picks.flatMap((cn) => busyFromCourses(index, [cn], dates));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.end).toBeGreaterThan(b.start);
      expect(b.start).toBeGreaterThanOrEqual(0);
      expect(b.end).toBeLessThanOrEqual(24 * 60);
      expect(b.campus).not.toBe("");
    }
  });

  it("reads a sane term span out of the live dump", () => {
    const bounds = termBounds(courses)!;
    expect(bounds.start <= bounds.typicalStart).toBe(true);
    expect(bounds.typicalStart <= bounds.end).toBe(true);
    expect(bounds.start.slice(0, 4)).toBe(TERM.slice(0, 4));
  });

  it("finds a real course through the search the picker uses", () => {
    const hits = searchCourses(courses, "cmpt 120");
    expect(hits.length).toBeGreaterThan(0);
    expect(`${hits[0].dept} ${hits[0].number}`).toBe("CMPT 120");
  });
});
