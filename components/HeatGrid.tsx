"use client";

import { useMemo } from "react";
import { CROSS_MS, HoverCard, useHoverCard } from "@/components/HoverCard";
import { NowLine, useNowMarker, useTodayColumn } from "@/components/NowLine";
import type { AttendanceControl, Member } from "@/components/WeekGrid";
import { DayHeading } from "@/components/DayHeading";
import { COLUMN_HEIGHT, DAY_CELL, DAY_TRACK, GRID_SCROLLER, LEGEND_HEIGHT } from "@/lib/grid-layout";
import { availabilityBands, type AvailabilityBand, type BusyBlock } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// Emerald, matching the "everyone free" green the detailed grid already uses.
const FILL = [16, 185, 129] as const;

/**
 * Stripes for the bands where someone is in class on campus.
 *
 * A hatch rather than a second fill colour: the emerald ramp is the whole
 * reading of this view, and a solid grey heavy enough to notice would compete
 * with the pale end of it. A neutral at this alpha sits under both themes
 * without being told which one it's in.
 */
const IN_CLASS_HATCH =
  "repeating-linear-gradient(45deg, transparent 0 5px, rgba(128,128,128,0.16) 5px 10px)";

/**
 * The same idea as IN_CLASS_HATCH, for a class attended from home. Blue rather
 * than grey so an all-online hour doesn't read as the same "in a room" state
 * the detailed grid marks with a white corner dot.
 */
const ONLINE_HATCH =
  "repeating-linear-gradient(-45deg, transparent 0 5px, rgba(59,130,246,0.22) 5px 10px)";

/**
 * Alpha for `n of total` free. Zero is left transparent so the column's own
 * background shows through — an empty band should read as the paper, not as a
 * very pale green. The floor at 0.12 keeps one person out of eight visible.
 */
function fillAlpha(free: number, total: number): number {
  if (free === 0 || total === 0) return 0;
  return 0.12 + 0.73 * (free / total);
}

/** "Ann, Bo, Cy" — and "+2" past three, so the label stays on one line. */
function nameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/** "Ann · CMPT 365" — name alone when the block has no course to point at. */
function personCourse(name: string, course: string): string {
  return course ? `${name} · ${course}` : name;
}

/**
 * What is in the way during a band, per busy member and as a distinct list.
 *
 * The band itself only knows *who* is busy — `AvailabilityBand` carries indices,
 * not blocks — but the blocks are still in props, and a band is cut at class
 * edges, so an overlap test lands on whole classes and never half of one.
 *
 * Without this the view shades free time and draws nothing else, which leaves a
 * bare column meaning three different things: in class, not on campus yet, or no
 * class at all that day. Only the hover card could tell them apart.
 *
 * Skipped blocks are ignored here: they don't occupy the hour (that's why the
 * band opened), and they surface under their own "Skipping" line instead.
 */
function coursesDuring(
  band: AvailabilityBand,
  memberIds: number[],
  busyByMember: Record<number, BusyBlock[]>,
  /** When set, only blocks with this status are counted. */
  only?: "going" | "remote"
): { byMember: Map<number, string[]>; all: string[] } {
  const byMember = new Map<number, string[]>();
  const all: string[] = [];
  for (const i of band.busyIndices) {
    const mine: string[] = [];
    for (const b of busyByMember[memberIds[i]] ?? []) {
      if (b.day !== band.day || b.start >= band.end || b.end <= band.start) continue;
      if (b.status === "skipping") continue;
      const status = b.status ?? "going";
      if (only && status !== only) continue;
      if (!mine.includes(b.course)) mine.push(b.course);
      if (!all.includes(b.course)) all.push(b.course);
    }
    byMember.set(i, mine);
  }
  return { byMember, all };
}

/**
 * Attendance deviations overlapping a band — the half the heatmap used to
 * swallow. Skipping is why a green window opened; online is why a hatched hour
 * isn't anchoring anyone to a campus. Both need a name on the card, because
 * this view draws no class blocks of its own.
 */
function attendanceDuring(
  band: AvailabilityBand,
  members: Member[],
  busyByMember: Record<number, BusyBlock[]>
): { skipping: string[]; online: string[] } {
  const skipping: string[] = [];
  const online: string[] = [];
  for (const m of members) {
    for (const b of busyByMember[m.id] ?? []) {
      if (b.day !== band.day || b.start >= band.end || b.end <= band.start) continue;
      if (b.status === "skipping") {
        const line = personCourse(m.displayName, b.course);
        if (!skipping.includes(line)) skipping.push(line);
      } else if (b.status === "remote") {
        const line = personCourse(m.displayName, b.course);
        if (!online.includes(line)) online.push(line);
      }
    }
  }
  return { skipping, online };
}

/** One person's marked class, drawn as an outline on top of the bands. */
interface StatusMark {
  member: Member;
  block: BusyBlock;
}

/**
 * The viewer's class that overlaps this band, if any — including a skipped one,
 * which is usually why the green window opened. Prefer a skip when both a skip
 * and another class share the hour (rare), because that's the status the card
 * needs to be able to undo.
 */
function ownBlockDuring(
  band: AvailabilityBand,
  memberId: number | undefined,
  busyByMember: Record<number, BusyBlock[]>
): BusyBlock | null {
  if (memberId === undefined) return null;
  const hits = (busyByMember[memberId] ?? []).filter(
    (b) =>
      b.day === band.day &&
      b.start < band.end &&
      b.end > band.start &&
      b.classNumber !== undefined
  );
  if (hits.length === 0) return null;
  return hits.find((b) => b.status === "skipping") ?? hits[0];
}

/** 80 -> "1h 20m", 50 -> "50m" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  dayStart: number;
  dayEnd: number;
  /** One person's week: the ramp collapses to free/busy, and so does the wording. */
  solo?: boolean;
  /** Monday of the week on screen, as YYYY-MM-DD — places the "now" line. */
  weekStart?: string;
  /**
   * Lets the viewer say whether they're going. Day headings cover whole days;
   * bands that overlap one of their classes also carry the three buttons, so
   * Availability isn't a view you have to leave to mark a single lecture.
   * Skipped and online classes still leave dashed / blue outlines on the bands
   * they affect, so a greener hour shows why it opened.
   */
  attendance?: AttendanceControl;
  /**
   * Height of the day columns. Defaults to the shared COLUMN_HEIGHT, which is
   * what keeps this and the detailed grid the same size behind their toggle —
   * only pass something else somewhere the two aren't swapped, like the home
   * page demo, where a full-height week is just a wall to scroll past.
   */
  columnHeight?: string;
}

/**
 * The week as a LettuceMeet-style heatmap: forget whose class is whose, and
 * shade each stretch of the day by how many people are free in it. The detailed
 * grid answers "what is Ann's Tuesday"; this one answers "when can we meet",
 * which `commonFree` can only answer when *literally everyone* is free.
 *
 * The bands are the same intervals the detailed grid draws — cut at real class
 * edges, not on a half-hour clock — so a green stretch here starts and ends at
 * the times the lists below the grid quote.
 */
export function HeatGrid({
  members,
  busyByMember,
  dayStart,
  dayEnd,
  solo = false,
  weekStart,
  attendance,
  columnHeight = COLUMN_HEIGHT,
}: Props) {
  const hover = useHoverCard();
  const now = useNowMarker(weekStart, dayStart, dayEnd);
  const { trackRef, todayIndex } = useTodayColumn(weekStart);

  // Only people with a schedule constrain anything; someone with nothing saved
  // would read as free all week and wash the whole grid green.
  const withSchedules = useMemo(
    () => members.filter((m) => (busyByMember[m.id] ?? []).length > 0),
    [members, busyByMember]
  );

  const bands = useMemo(
    () =>
      availabilityBands({
        members: withSchedules.map((m) => ({
          name: m.displayName,
          busy: busyByMember[m.id] ?? [],
        })),
        dayStart,
        dayEnd,
      }),
    [withSchedules, busyByMember, dayStart, dayEnd]
  );

  // Indices into `withSchedules` are what the bands speak in; this maps them
  // back to the member ids the blocks are keyed on.
  const memberIds = useMemo(() => withSchedules.map((m) => m.id), [withSchedules]);

  /**
   * Skipped and online classes, still drawn even though `availabilityBands`
   * has already dropped the skips from its math. Without these outlines a
   * greener band just appears, and the detailed grid's whole point — seeing
   * *why* a window opened — has no counterpart here.
   */
  const marks = useMemo(() => {
    const skipping: StatusMark[] = [];
    const online: StatusMark[] = [];
    for (const m of withSchedules) {
      for (const block of busyByMember[m.id] ?? []) {
        if (block.status === "skipping") skipping.push({ member: m, block });
        else if (block.status === "remote") online.push({ member: m, block });
      }
    }
    return { skipping, online };
  }, [withSchedules, busyByMember]);

  const total = withSchedules.length;
  // One swatch per person up to six, then a sampled ramp — a twelve-person
  // group doesn't need twelve legend chips to read as a gradient.
  const swatches = solo ? 2 : Math.min(total, 6) + 1;

  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;
  const heightPct = (mins: number) => (mins / span) * 100;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
        Nobody here has added a schedule yet, so there&apos;s nothing to shade.
        Add your courses above, or send someone the link to this group.
      </p>
    );
  }

  return (
    <div className={GRID_SCROLLER}>
      <div className="flex flex-col gap-2">
        {/* Legend. The ramp is sampled at the real group size, so the swatches
            are the exact shades on the grid rather than a generic gradient.
            Fixed height, and matched by the detailed grid's own legend, so
            switching between the two views doesn't move the page under you. */}
        <div
          className={`flex flex-col items-center justify-center gap-1 text-xs ${LEGEND_HEIGHT}`}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="text-neutral-500">{solo ? "In class" : `0/${total} free`}</span>
            <span className="flex overflow-hidden rounded-sm border border-neutral-300 dark:border-neutral-700">
              {Array.from({ length: swatches }, (_, i) => (
                <span
                  key={i}
                  className="h-3.5 w-6"
                  style={{
                    backgroundColor: `rgba(${FILL.join(",")},${fillAlpha((i / (swatches - 1)) * total, total)})`,
                  }}
                />
              ))}
            </span>
            <span className="text-neutral-500">{solo ? "Free" : `${total}/${total} free`}</span>
            <span className="text-neutral-400 dark:text-neutral-500">
              · hover a band {solo ? "for the time" : "to see who"}
            </span>
          </div>
          {/* The two unshaded states, plus the attendance marks drawn over the
              bands. Without a key for them a blank Monday and a blank morning
              read as a bug rather than as the point of the view, a hatched
              band reads as a rendering fault, and a dashed outline over a
              green window has no name. The reason the mornings are blank is a
              sentence long, so it lives in the swatch's title rather than on a
              third line — the legend is pinned to LEGEND_HEIGHT so this view
              and the detailed one stay the same height behind their toggle. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 text-neutral-400 dark:text-neutral-500">
            <span className="flex items-center gap-1">
              <span
                className="h-3.5 w-6 rounded-sm border border-neutral-300 dark:border-neutral-700"
                style={{ backgroundImage: IN_CLASS_HATCH }}
              />
              in class
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-3.5 w-6 rounded-sm border border-neutral-300 dark:border-neutral-700"
                style={{ backgroundImage: ONLINE_HATCH }}
              />
              online
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3.5 w-6 rounded-sm border-2 border-dashed border-neutral-400 dark:border-neutral-500" />
              skipping
            </span>
            <span
              className="flex items-center gap-1"
              title="Before their first class, or after the day's last — they'd be making the trip specially"
            >
              <span className="h-3.5 w-6 rounded-sm border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900" />
              nobody on campus
            </span>
          </div>
        </div>

        <div className="flex gap-2 text-xs">
          {/* Hour gutter. The empty header mirrors the day-name row so the hour
              labels line up with the grid lines, and its width matches the
              detailed grid's so the two views don't shift when you toggle. */}
          <div className="w-12 shrink-0">
            <div className="mb-1 text-center font-medium" aria-hidden>&nbsp;</div>
            <div className={`relative ${columnHeight}`}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-neutral-500 tabular-nums"
                  style={{ top: `${pct(h)}%` }}
                >
                  {formatTime(h).replace(":00", "")}
                </div>
              ))}
            </div>
          </div>

          <div ref={trackRef} className={DAY_TRACK}>
            {WEEKDAYS.map((day, dayIndex) => (
              <div key={day} className={DAY_CELL}>
                <DayHeading
                  day={day}
                  isToday={dayIndex === todayIndex}
                  attendance={attendance}
                  hover={hover}
                />
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${columnHeight}`}
                >
                  {/* Behind the bands, so the hour lines stay readable through
                      the pale end of the ramp and vanish under the dark end. */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                      style={{ top: `${pct(h)}%` }}
                    />
                  ))}

                  {bands
                    .filter((b) => b.day === day)
                    .map((band) => {
                      const minutes = band.end - band.start;
                      const free = band.freeIndices.length;
                      const freeNames = band.freeIndices.map((i) => withSchedules[i].displayName);
                      const awayNames = band.awayIndices.map((i) => withSchedules[i].displayName);
                      const outsideNames = band.outsideIndices.map((i) => withSchedules[i].displayName);
                      const deviations = attendanceDuring(band, withSchedules, busyByMember);
                      // On-campus class vs attended-from-home: both keep the
                      // hour busy, but the hatch has to say which, or an
                      // all-online lecture reads as a room nobody can enter.
                      const campusCourses = coursesDuring(band, memberIds, busyByMember, "going");
                      const onlineCourses = coursesDuring(band, memberIds, busyByMember, "remote");
                      const onCampusBusy = band.busyIndices.filter((i) =>
                        (campusCourses.byMember.get(i) ?? []).length > 0
                      );
                      const onlineBusy = band.busyIndices.filter((i) =>
                        (onlineCourses.byMember.get(i) ?? []).length > 0
                      );
                      const onCampusNames = onCampusBusy.map((i) => withSchedules[i].displayName);
                      const onlineNames = onlineBusy.map((i) => withSchedules[i].displayName);
                      // Nobody free and someone in a room: the band is a class,
                      // so say which one instead of leaving it bare. An
                      // all-online hour is its own state, not "in class".
                      const inClass = free === 0 && onCampusBusy.length > 0;
                      const allOnline = free === 0 && onCampusBusy.length === 0 && onlineBusy.length > 0;
                      const titleCourses = inClass
                        ? campusCourses
                        : allOnline
                          ? onlineCourses
                          : null;
                      /**
                       * "Martin, Angus Cheng · CMPT 365" rather than naming the
                       * course once per person — a lecture is the common case,
                       * and repeating it wrapped the line for no information.
                       * Null when the title already carries the courses, when
                       * there are too many people for the card to hold them, or
                       * when nobody is in class at all.
                       */
                      const busyCourseLine = (
                        indices: number[],
                        names: string[],
                        courses: { byMember: Map<number, string[]> },
                        alreadyTitled: boolean
                      ): string | null => {
                        if (alreadyTitled || indices.length === 0) return null;
                        if (indices.length > 3) return null;
                        const sig = (i: number) => (courses.byMember.get(i) ?? []).join(", ");
                        const first = sig(indices[0]);
                        if (first === "") return null;
                        return indices.every((i) => sig(i) === first)
                          ? `${names.join(", ")} · ${first}`
                          : indices
                              .map((i) => {
                                const c = sig(i);
                                const name = withSchedules[i].displayName;
                                return c === "" ? name : `${name} · ${c}`;
                              })
                              .join(", ");
                      };
                      // Naming everyone under a "7/7" only repeats the count in
                      // longer form. Names earn their line when the band is
                      // split, which is when you actually need to know who.
                      const showNames = !solo && free > 0 && free < total && minutes >= 55;
                      // Near the top of the ramp the list is mostly "+4", which
                      // spends a line to say nothing: on a 7/8 the fact you want
                      // is the one person who can't make it. Only worth
                      // inverting in a group big enough for the plain list to
                      // have been truncated in the first place.
                      const missingNames =
                        total >= 5 && total - free <= 2
                          ? withSchedules
                              .filter((_, i) => !band.freeIndices.includes(i))
                              .map((m) => m.displayName)
                          : null;
                      const hatch = inClass
                        ? IN_CLASS_HATCH
                        : allOnline
                          ? ONLINE_HATCH
                          : undefined;
                      // Your class in this band — including one you skipped,
                      // which is usually why the green opened. That's what the
                      // status buttons on the card write against.
                      const own = ownBlockDuring(band, attendance?.memberId, busyByMember);
                      return (
                        <div
                          key={band.start}
                          // A ring on the between-classes bands rather than a
                          // different hue: the ramp already carries the count,
                          // and a second colour would compete with it.
                          className="absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-center leading-tight"
                          style={{
                            top: `${pct(band.start)}%`,
                            height: `${heightPct(minutes)}%`,
                            // The ramp stays honest — a class is still zero
                            // people free — and the stripes go over the top of
                            // it rather than instead of it.
                            backgroundColor: `rgba(${FILL.join(",")},${fillAlpha(free, total)})`,
                            backgroundImage: hatch,
                          }}
                          onMouseEnter={(e) =>
                            hover.show({
                              // When the card carries your status buttons, lead
                              // with the course — same question the detailed
                              // grid asks: what is this class, am I going.
                              title: own
                                ? own.course
                                : solo
                                ? free > 0
                                  ? "Gap between your classes"
                                  : inClass || allOnline
                                    ? titleCourses && titleCourses.all.length > 0
                                      ? nameList(titleCourses.all, 2)
                                      : allOnline
                                        ? "Online"
                                        : "You have class"
                                    : awayNames.length > 0
                                      ? "No class today"
                                      : "Off campus"
                                : inClass && titleCourses && titleCourses.all.length > 0
                                  ? nameList(titleCourses.all, 2)
                                  : allOnline && titleCourses && titleCourses.all.length > 0
                                    ? nameList(titleCourses.all, 2)
                                    : `${free} of ${total} on campus and free`,
                              subtitle: own
                                ? `${LABELS[day]}${own.detail ? ` · ${own.detail}` : ""}`
                                : LABELS[day],
                              lines: [
                                `${formatTime(band.start)} – ${formatTime(band.end)} · ${formatDuration(minutes)}`,
                                ...(solo
                                  ? [
                                      ...(awayNames.length > 0
                                        ? ["No class — you'd come to campus specially"]
                                        : outsideNames.length > 0
                                          ? ["Before your first class, or after your last"]
                                          : []),
                                      // Solo still needs the reason a gap opened:
                                      // your own skipped class is the only one
                                      // that could have done it.
                                      ...(deviations.skipping.length > 0
                                        ? [{ label: "Skipping", value: nameList(deviations.skipping, 3) }]
                                        : []),
                                      ...(deviations.online.length > 0 && free > 0
                                        ? [{ label: "Online", value: nameList(deviations.online, 3) }]
                                        : []),
                                    ]
                                  : [
                                      // On a class band the title already
                                      // says what's happening, so the "nobody
                                      // is free" line is the same fact twice.
                                      ...(freeNames.length > 0
                                        ? [{ label: "Free", value: freeNames.join(", ") }]
                                        : inClass || allOnline
                                          ? []
                                          : ["Nobody is on campus with a gap here"]),
                                      // Which class, not just who — but only
                                      // while it stays a line. Past three
                                      // people the card grows a paragraph and
                                      // the names are the useful half.
                                      ...(onCampusNames.length > 0
                                        ? [
                                            {
                                              label: "In class",
                                              value:
                                                busyCourseLine(
                                                  onCampusBusy,
                                                  onCampusNames,
                                                  campusCourses,
                                                  inClass
                                                ) ?? onCampusNames.join(", "),
                                            },
                                          ]
                                        : []),
                                      ...(onlineNames.length > 0
                                        ? [
                                            {
                                              label: "Online",
                                              value:
                                                busyCourseLine(
                                                  onlineBusy,
                                                  onlineNames,
                                                  onlineCourses,
                                                  allOnline
                                                ) ?? onlineNames.join(", "),
                                            },
                                          ]
                                        : []),
                                      // Why the free set grew: the shading
                                      // already says someone is free; this
                                      // says they freed the hour on purpose.
                                      ...(deviations.skipping.length > 0
                                        ? [{ label: "Skipping", value: nameList(deviations.skipping, 3) }]
                                        : []),
                                      // The two reasons someone isn't counted. Worth
                                      // spelling out — otherwise a 2/7 next to a full
                                      // detailed grid looks like a bug.
                                      ...(outsideNames.length > 0
                                        ? [{ label: "Off campus", value: outsideNames.join(", ") }]
                                        : []),
                                      ...(awayNames.length > 0
                                        ? [{ label: "No class", value: awayNames.join(", ") }]
                                        : []),
                                    ]),
                                // Only the split. One campus is the ordinary
                                // case and saying so is a line of noise on
                                // every card; two means they can't actually
                                // meet, which is the one thing worth the row.
                                ...(free > 0 && !band.sharedCampus
                                  ? [`Split across ${band.campuses.join(" and ")}`]
                                  : []),
                              ],
                              // Grey on a class band: the emerald square is the
                              // ramp's colour, and this band isn't on it. Blue
                              // when the whole hour is online for the same
                              // reason the hatch is.
                              accent: own
                                ? attendance!.color
                                : allOnline
                                ? "#3b82f6"
                                : inClass
                                  ? "#a3a3a3"
                                  : `rgb(${FILL.join(",")})`,
                              x: e.clientX,
                              y: e.clientY,
                              status:
                                own && attendance
                                  ? {
                                      current: own.status ?? "going",
                                      note: own.note ?? null,
                                      allowRepeat: true,
                                      onPick: (status, note, opts) =>
                                        attendance.setBlock(own, status, note, opts),
                                    }
                                  : undefined,
                            })
                          }
                          onMouseMove={(e) =>
                            hover.move(e.clientX, e.clientY)
                          }
                          onMouseLeave={() => hover.hide(own ? CROSS_MS : 0)}
                        >
                          {/* The count is the point of the view, so it goes in
                              first and stays as long as there's a line for it.
                              Names and times only earn their place on the taller
                              bands — the ten-minute slivers between a class
                              ending at :20 and the next starting at :30 can't
                              hold anything, and shouldn't pretend to. */}
                          {minutes >= 30 &&
                            (inClass || allOnline ? (
                              /* The count on a class band is always 0/n, which
                                 says nothing you can't see from the shading.
                                 The course codes say what the band actually is,
                                 and in solo mode they replace a bare "Class". */
                              <span className="w-full truncate text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                                {titleCourses && titleCourses.all.length > 0
                                  ? nameList(titleCourses.all, 2)
                                  : solo
                                    ? allOnline
                                      ? "Online"
                                      : "Class"
                                    : `0/${total}`}
                              </span>
                            ) : (
                              <span className="font-semibold text-[11px] text-emerald-950 tabular-nums dark:text-white">
                                {solo ? (free > 0 ? "Gap" : "") : `${free}/${total}`}
                              </span>
                            ))}
                          {showNames && (
                            <span className="w-full truncate text-[10px] font-medium text-emerald-950/85 dark:text-white/85">
                              {missingNames
                                ? `all but ${missingNames.join(", ")}`
                                : nameList(freeNames)}
                            </span>
                          )}
                          {minutes >= (showNames ? 80 : 55) && (
                            <span
                              className={`text-[10px] tabular-nums ${
                                inClass || allOnline
                                  ? "text-neutral-500 dark:text-neutral-400"
                                  : "text-emerald-950/70 dark:text-white/70"
                              }`}
                            >
                              {formatTime(band.start)}–{formatTime(band.end)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                  {/* Skipped classes sit on top of the bands they opened, the
                      same hollow dashed outline the detailed grid uses — so a
                      greener hour still shows *why*. Pointer-events none: the
                      band under it owns the hover, which now names the skip.
                      Online marks are quieter — a blue edge — because the hour
                      is still busy and the hatch already carries that. */}
                  {marks.skipping
                    .filter(({ block }) => block.day === day)
                    .map(({ member, block }) => (
                      <div
                        key={`skip-${member.id}-${block.classNumber ?? block.label}-${block.start}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed"
                        style={{
                          top: `${pct(block.start)}%`,
                          height: `${heightPct(block.end - block.start)}%`,
                          borderColor: member.color,
                        }}
                        title={`${member.displayName} skipping ${block.course}`}
                      />
                    ))}
                  {marks.online
                    .filter(({ block }) => block.day === day)
                    .map(({ member, block }) => (
                      <div
                        key={`online-${member.id}-${block.classNumber ?? block.label}-${block.start}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-1 rounded-md border border-blue-500/70"
                        style={{
                          top: `${pct(block.start)}%`,
                          height: `${heightPct(block.end - block.start)}%`,
                        }}
                        title={`${member.displayName} online · ${block.course}`}
                      >
                        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500 ring-1 ring-white/80" />
                      </div>
                    ))}

                  {now?.day === day && <NowLine top={pct(now.minutes)} minutes={now.minutes} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover.card && (
        <HoverCard
          card={hover.card}
          cardRef={hover.cardRef}
          onEnter={hover.stopClosing}
          onLeave={() => hover.hide(CROSS_MS)}
        />
      )}
    </div>
  );
}
