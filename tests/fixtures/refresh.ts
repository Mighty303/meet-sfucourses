// Regenerates term-sample.json from the live sfucourses API.
//
// Run deliberately (`npm run test:fixture`), never automatically: the point of a
// committed fixture is that the unit suite's inputs only change when someone
// decides they should. The picks below are shape-driven, not course-driven — we
// want one of every arrangement the parsers have to survive, so a term where
// CMPT 225 happens to move rooms doesn't churn the file.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  currentTermCode,
  fetchTermSections,
  type CourseWithSections,
  type SectionDetail,
} from "../../lib/sfu.ts";

const OUT = fileURLToPath(new URL("./term-sample.json", import.meta.url));
const TARGET = 15;

const hasScheduled = (s: SectionDetail) =>
  s.schedules.some((x) => x.days.trim() && x.startTime && x.endTime);
const hasAsync = (s: SectionDetail) => s.schedules.every((x) => !x.days.trim());
const campusesOf = (c: CourseWithSections) =>
  new Set(c.sections.flatMap((s) => s.schedules.map((x) => x.campus.trim()).filter(Boolean)));

/** Each wanted shape, with the test that recognises it. First match wins. */
const SHAPES: { name: string; match: (c: CourseWithSections) => boolean }[] = [
  { name: "in-person, single meeting", match: (c) => c.sections.some((s) => hasScheduled(s) && s.schedules.length === 1) },
  { name: "multi-schedule section (LEC + LAB/TUT)", match: (c) => c.sections.some((s) => hasScheduled(s) && s.schedules.length > 1) },
  { name: "online section (campus is empty)", match: (c) => c.sections.some((s) => s.schedules.some((x) => x.days.trim() && !x.campus.trim())) },
  { name: "async section (no days at all)", match: (c) => c.sections.some(hasAsync) },
  { name: "course taught at more than one campus", match: (c) => campusesOf(c).size > 1 },
  { name: "non-Burnaby campus", match: (c) => [...campusesOf(c)].some((x) => x !== "Burnaby") },
  { name: "delivery method other than In Person", match: (c) => c.sections.some((s) => s.deliveryMethod && s.deliveryMethod !== "In Person") },
  { name: "weekend meeting", match: (c) => c.sections.some((s) => s.schedules.some((x) => /Sa|Su/.test(x.days))) },
];

const term = process.argv[2] ?? currentTermCode();
console.log(`fetching ${term}...`);
const all = await fetchTermSections(term);
console.log(`${all.length} courses upstream`);

const picked = new Map<string, CourseWithSections>();
const key = (c: CourseWithSections) => `${c.dept} ${c.number}`;

for (const shape of SHAPES) {
  const hit = all.find((c) => shape.match(c) && !picked.has(key(c)));
  if (hit) picked.set(key(hit), hit);
  else console.warn(`  no course upstream matches: ${shape.name}`);
}

// Fill out with CMPT and MATH so searchCourses has something to rank: several
// courses sharing a dept, and titles with words worth searching for.
for (const c of all) {
  if (picked.size >= TARGET) break;
  if ((c.dept === "CMPT" || c.dept === "MATH") && !picked.has(key(c))) picked.set(key(c), c);
}

const sample = [...picked.values()].sort(
  (a, b) => a.dept.localeCompare(b.dept) || a.number.localeCompare(b.number, undefined, { numeric: true })
);

writeFileSync(OUT, JSON.stringify(sample, null, 2) + "\n");
const sections = sample.reduce((n, c) => n + c.sections.length, 0);
console.log(`wrote ${sample.length} courses / ${sections} sections to term-sample.json`);
for (const c of sample) console.log(`  ${key(c)} — ${c.title} (${c.sections.length} sections)`);
