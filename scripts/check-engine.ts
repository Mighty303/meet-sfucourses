import assert from "node:assert/strict";
import {
  mergeIntervals,
  complement,
  intersectPair,
  intersectAll,
  weekDates,
  busyFromCourses,
  commonFree,
  partialFree,
  attending,
  availabilityBands,
} from "../lib/overlap";
import {
  fetchTermSections,
  indexByClassNumber,
  formatTime,
  toMinutes,
} from "../lib/sfu";

// --- pure interval math -----------------------------------------------------
assert.deepEqual(
  mergeIntervals([{ start: 60, end: 90 }, { start: 80, end: 100 }, { start: 100, end: 110 }]),
  [{ start: 60, end: 110 }],
  "touching + overlapping intervals collapse"
);
assert.deepEqual(
  complement([{ start: 600, end: 660 }], { start: 480, end: 720 }),
  [{ start: 480, end: 600 }, { start: 660, end: 720 }],
  "complement splits around a class"
);
assert.deepEqual(complement([], { start: 480, end: 720 }), [{ start: 480, end: 720 }]);
assert.deepEqual(
  complement([{ start: 400, end: 800 }], { start: 480, end: 720 }),
  [],
  "fully covered day yields nothing"
);
assert.deepEqual(
  intersectPair([{ start: 0, end: 100 }, { start: 200, end: 300 }], [{ start: 50, end: 250 }]),
  [{ start: 50, end: 100 }, { start: 200, end: 250 }],
  "intersection keeps both fragments"
);
assert.deepEqual(
  intersectAll([[{ start: 0, end: 100 }], [{ start: 40, end: 90 }], [{ start: 50, end: 200 }]]),
  [{ start: 50, end: 90 }]
);

// --- against the live API ---------------------------------------------------
const term = "2025-fall";
const courses = await fetchTermSections(term);
const index = indexByClassNumber(courses);
console.log(`term ${term}: ${courses.length} courses, ${index.size} sections`);

const dates = weekDates(new Date("2025-10-15T12:00:00"));
assert.equal(dates.Mo, "2025-10-13");
assert.equal(dates.Su, "2025-10-19");

// Pick three real in-person sections that actually meet, as three "friends".
const picks: string[] = [];
for (const [classNumber, { section }] of index) {
  const meets = section.schedules.some(
    (s) => s.days.trim() && s.campus.trim() === "Burnaby" && s.startDate <= dates.Mo && s.endDate >= dates.Fr
  );
  if (meets) picks.push(classNumber);
  if (picks.length === 3) break;
}
assert.equal(picks.length, 3, "found three sample sections");

const membersBusy = picks.map((cn) => busyFromCourses(index, [cn], dates));
membersBusy.forEach((busy, i) => {
  assert.ok(busy.length > 0, `member ${i} has busy blocks`);
  for (const b of busy) {
    assert.ok(b.end > b.start, "block has positive duration");
    assert.ok(b.start >= 0 && b.end <= 24 * 60, "block inside the day");
  }
});

const dayStart = toMinutes("08:00");
const dayEnd = toMinutes("22:00");
const sample = membersBusy.map((busy, i) => ({ name: `friend ${i + 1}`, busy }));
const free = commonFree({ members: sample, dayStart, dayEnd, minMinutes: 60 });

// Every reported window must be free for every member — the property that matters.
for (const w of free) {
  assert.ok(w.end - w.start >= 60, "respects minMinutes");
  assert.ok(w.start >= dayStart && w.end <= dayEnd, "inside the search window");
  for (const busy of membersBusy) {
    for (const b of busy.filter((b) => b.day === w.day)) {
      assert.ok(b.end <= w.start || b.start >= w.end, `window ${w.day} ${formatTime(w.start)} collides with ${b.label}`);
    }
  }
}

// A gap between classes must be bounded by a class on both sides, and the names
// on it must be exactly the members who actually have a class that day.
for (const w of free) {
  const dayBlocks = membersBusy.flatMap((busy) => busy.filter((b) => b.day === w.day));
  const bounded =
    dayBlocks.some((b) => b.end === w.start) && dayBlocks.some((b) => b.start === w.end);
  assert.equal(w.betweenClasses, bounded, "betweenClasses matches the surrounding classes");
  assert.deepEqual(
    w.onCampus,
    sample.filter((m) => m.busy.some((b) => b.day === w.day)).map((m) => m.name),
    "only members with a class that day are listed"
  );
}

// A member with no classes on Monday is free all day: they must not constrain
// the window and must not be named on it.
const idle = commonFree({
  members: [...sample, { name: "no classes", busy: [] }],
  dayStart, dayEnd, minMinutes: 60, days: ["Mo"],
});
const mondayOnly = free.filter((w) => w.day === "Mo");
assert.equal(idle.length, mondayOnly.length, "an idle member changes no window");
assert.ok(
  idle.every((w) => !w.onCampus.includes("no classes")),
  "an idle member is never listed as available"
);

// Meetups are weekday-only: weekend windows must never appear by default.
assert.ok(
  free.every((w) => w.day !== "Sa" && w.day !== "Su"),
  "no weekend windows in the default result"
);
// ...but an explicit days list is still honoured.
const weekend = commonFree({ members: sample, dayStart, dayEnd, minMinutes: 60, days: ["Sa"] });
assert.ok(weekend.every((w) => w.day === "Sa"), "explicit days override still works");

// A member who is busy all week must drive the result to nothing.
const allBusy = [{ day: "Mo" as const, start: 0, end: 1440, campus: "Burnaby", label: "blocked", course: "blocked", detail: "" }];
const blocked = commonFree({
  members: [...sample, { name: "always busy", busy: allBusy }],
  dayStart, dayEnd, minMinutes: 60, days: ["Mo"],
});
assert.equal(blocked.length, 0, "a fully-busy member removes every Monday window");

// The positive gap case, built by hand: the live sample above has at most one
// class per member per day, so nothing there is ever wedged between two.
const block = (start: number, end: number, label: string) => ({
  day: "Mo" as const, start, end, campus: "Burnaby", label, course: label, detail: "",
});
const gapWindows = commonFree({
  members: [
    { name: "Ada", busy: [block(540, 600, "A"), block(690, 750, "B")] },   // 9-10, 11:30-12:30
    { name: "Bo", busy: [block(570, 600, "C"), block(690, 780, "D")] },    // 9:30-10, 11:30-13:00
    { name: "Cy", busy: [] },                                              // no class Monday
  ],
  dayStart, dayEnd, minMinutes: 60, days: ["Mo"],
});
const wedged = gapWindows.filter((w) => w.betweenClasses);
assert.equal(wedged.length, 1, "exactly one window sits between classes");
assert.equal(wedged[0].start, 600);
assert.equal(wedged[0].end, 690, "the gap runs 10:00-11:30");
assert.deepEqual(wedged[0].onCampus, ["Ada", "Bo"], "the member with no Monday class isn't named");
assert.ok(
  gapWindows.some((w) => !w.betweenClasses && w.start === dayStart),
  "the morning window before the first class is not a gap"
);
assert.ok(
  gapWindows.some((w) => !w.betweenClasses && w.end === dayEnd),
  "the evening window after the last class is not a gap"
);

console.log(`sections used: ${picks.join(", ")}`);
console.log(`common free windows (>=60m): ${free.length}`);
for (const w of free.slice(0, 6)) {
  console.log(
    `  ${w.day} ${formatTime(w.start)}-${formatTime(w.end)} campuses=[${w.campuses}] shared=${w.sharedCampus} gap=${w.betweenClasses} free=[${w.onCampus}]`
  );
}
// --- partial windows --------------------------------------------------------
// The full-group windows partialFree reports must be exactly what commonFree
// reports; the two must never drift.
const everyoneWindows = partialFree({ members: sample, dayStart, dayEnd, minMinutes: 60 })
  .filter((w) => w.everyone);
assert.deepEqual(
  everyoneWindows.map((w) => `${w.day} ${w.start}-${w.end}`).sort(),
  free.map((w) => `${w.day} ${w.start}-${w.end}`).sort(),
  "partialFree's everyone-windows match commonFree"
);

// Bo is busy right through the window Ada and Cy share, so the full group has
// nothing on Monday while the pair still has 10:00-12:00.
const trio = [
  { name: "Ada", busy: [block(540, 600, "A")] },              // 9-10
  { name: "Bo", busy: [block(540, 720, "B")] },               // 9-12
  { name: "Cy", busy: [block(480, 600, "C"), block(720, 780, "D")] }, // 8-10, 12-13
];
// Capped at 13:00: past the last class everyone is trivially free, which would
// hand the full group a window and defeat the point of the fixture.
const opts = { members: trio, dayStart, dayEnd: toMinutes("13:00"), minMinutes: 60, days: ["Mo" as const] };
assert.equal(commonFree(opts).length, 0, "no window works for all three");

const some = partialFree(opts);
assert.ok(some.length > 0, "the pair's window survives when the group's doesn't");
assert.ok(some.every((w) => w.attendees.length >= 2), "never reports a solo 'meetup'");
assert.ok(some.every((w) => !w.everyone), "and none of these are full-group");
assert.ok(
  some.every((w) => w.onCampus.every((n) => w.attendees.includes(n))),
  "on-campus names are always a subset of the attendees"
);

const pair = some.find((w) => w.start === 600 && w.end === 720);
assert.ok(pair, "Ada and Cy are both free 10:00-12:00");
assert.deepEqual(pair.attendees, ["Ada", "Cy"]);
assert.deepEqual(pair.onCampus, ["Ada", "Cy"], "both have class that day, so both are on campus");
assert.equal(pair.betweenClasses, true, "Ada's 9-10 ends it and Cy's 12-13 starts it");

// Every reported window really is free for everyone named on it.
for (const w of some) {
  for (const name of w.attendees) {
    const m = trio.find((t) => t.name === name)!;
    for (const b of m.busy.filter((b) => b.day === w.day)) {
      assert.ok(b.end <= w.start || b.start >= w.end, `${name} is busy during their own window`);
    }
  }
}

// No window may be a fragment of another with the same crowd — that's the
// maximality rule, and without it the list fills with overlapping duplicates.
for (const a of some) {
  for (const b of some) {
    if (a === b) continue;
    const sameCrowd =
      a.attendees.length === b.attendees.length &&
      a.attendees.every((n) => b.attendees.includes(n));
    assert.ok(
      !(sameCrowd && a.day === b.day && b.start <= a.start && b.end >= a.end),
      `${a.attendees} ${a.start}-${a.end} is contained in an identical window`
    );
  }
}

// A group below the minimum has nothing to report.
assert.deepEqual(partialFree({ ...opts, minAttendees: 4 }), [], "minAttendees above the group size");

console.log(`partial windows (>=2 people, Mon fixture): ${some.length}`);
console.log(`gaps between classes: ${free.filter((w) => w.betweenClasses).length}`);

// --- attendance deviations --------------------------------------------------
// Skipping drops a class out of busy time; online keeps it busy but stops it
// anchoring a campus. Both are what the availability views read.

const mid = block(600, 690, "mid"); // 10:00-11:30, the gap Ada and Bo share above
assert.deepEqual(
  attending([
    block(540, 600, "A"),
    { ...mid, status: "skipping" },
    block(690, 750, "B"),
  ]).map((b) => b.label),
  ["A", "B"],
  "attending() drops skipped classes and keeps the rest"
);

const beforeSkip = commonFree({
  members: [
    { name: "Ada", busy: [block(540, 600, "A"), mid, block(690, 750, "B")] },
    { name: "Bo", busy: [block(540, 600, "C"), mid, block(690, 750, "D")] },
  ],
  dayStart, dayEnd: toMinutes("13:00"), minMinutes: 30, days: ["Mo"],
});
assert.equal(
  beforeSkip.filter((w) => w.start === 600 && w.end === 690).length,
  0,
  "a shared middle class blocks the 10:00-11:30 window"
);

const afterSkip = commonFree({
  members: [
    {
      name: "Ada",
      busy: [block(540, 600, "A"), { ...mid, status: "skipping" }, block(690, 750, "B")],
    },
    {
      name: "Bo",
      busy: [block(540, 600, "C"), { ...mid, status: "skipping" }, block(690, 750, "D")],
    },
  ],
  dayStart, dayEnd: toMinutes("13:00"), minMinutes: 30, days: ["Mo"],
});
const opened = afterSkip.find((w) => w.start === 600 && w.end === 690);
assert.ok(opened, "skipping the middle class opens the hour for everyone");
assert.equal(opened.betweenClasses, true, "the opened hour is still a gap between classes");

// Online: still busy, but a Burnaby pin on a remote lecture must not make a
// free window look cross-campus when the other person is at Surrey. Same
// schedule with status "going" *does* split — that's the control.
const burnabyMorning = block(540, 600, "LEC");
const burnabyAfternoon = block(690, 750, "SEM");
const surreyMorning = {
  day: "Mo" as const,
  start: 540,
  end: 600,
  campus: "Surrey",
  label: "TUT",
  course: "TUT",
  detail: "",
};
const surreyAfternoon = {
  day: "Mo" as const,
  start: 690,
  end: 750,
  campus: "Surrey",
  label: "LAB",
  course: "LAB",
  detail: "",
};
const splitOpts = {
  dayStart,
  dayEnd: toMinutes("13:00"),
  minMinutes: 30,
  days: ["Mo" as const],
};
const inPersonSplit = commonFree({
  members: [
    { name: "Ada", busy: [burnabyMorning, burnabyAfternoon] },
    { name: "Bo", busy: [surreyMorning, surreyAfternoon] },
  ],
  ...splitOpts,
});
const splitNoon = inPersonSplit.find((w) => w.start === 600 && w.end === 690);
assert.ok(splitNoon, "Ada (Burnaby) and Bo (Surrey) still share a free hour");
assert.equal(splitNoon.sharedCampus, false, "two campuses report as a split when both are going");

const remoteWindows = commonFree({
  members: [
    {
      name: "Ada",
      busy: [
        { ...burnabyMorning, status: "remote" },
        { ...burnabyAfternoon, status: "remote" },
      ],
    },
    { name: "Bo", busy: [surreyMorning, surreyAfternoon] },
  ],
  ...splitOpts,
});
const noon = remoteWindows.find((w) => w.start === 600 && w.end === 690);
assert.ok(noon, "the hour between Ada's online lectures is still free with Bo");
assert.equal(noon.sharedCampus, true, "a remote lecture does not invent a campus split");
assert.deepEqual(noon.campuses, ["Surrey"], "only the in-person class anchors a campus");

const heat = availabilityBands({
  members: [
    {
      name: "Ada",
      busy: [block(540, 600, "A"), { ...mid, status: "skipping" }, block(690, 750, "B")],
    },
    { name: "Bo", busy: [block(540, 600, "C"), mid, block(690, 750, "D")] },
  ],
  dayStart, dayEnd: toMinutes("13:00"), days: ["Mo"],
});
const heatGap = heat.find((b) => b.day === "Mo" && b.start === 600 && b.end === 690);
assert.ok(heatGap, "availabilityBands cuts a band on the skipped hour");
assert.deepEqual(heatGap.freeIndices, [0], "only Ada is free — she skipped; Bo is still in class");
assert.deepEqual(heatGap.busyIndices, [1], "Bo remains busy through the hour");

console.log("ALL ENGINE CHECKS PASSED");
