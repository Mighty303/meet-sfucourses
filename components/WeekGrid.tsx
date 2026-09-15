"use client";

import { CROSS_MS, HoverCard, useHoverCard, type HoverCardData } from "@/components/HoverCard";
import { NowLine, useNowMarker, useTodayColumn } from "@/components/NowLine";
import { COLUMN_HEIGHT, DAY_CELL, DAY_TRACK, GRID_SCROLLER, LEGEND_HEIGHT } from "@/lib/grid-layout";
import { DayHeading } from "@/components/DayHeading";
import type { AttendanceStatus } from "@/lib/attendance-status";
import type { BusyBlock, FreeWindow } from "@/lib/overlap";
import { formatTime, WEEKDAYS, type DayKey } from "@/lib/sfu";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

// Blocks are placed by percentage, so back-to-back classes would share an edge
// and read as one long block. Insetting by a fixed pixel amount keeps the gap
// constant at every column height, instead of scaling with the class length.
const GAP_Y = 2;
const GAP_X = 3;

/**
 * A gap between classes is the window worth meeting in — everyone is already on
 * campus and has to stay for a later class. Free time before the first class or
 * after the last one is real, but it competes with going home, so it's dimmed
 * rather than coloured. Within the gaps, campus still decides green vs amber.
 */
function freeStyle(w: FreeWindow, solo: boolean) {
  if (!w.betweenClasses) {
    return {
      box: "bg-neutral-400/10 ring-1 ring-inset ring-neutral-400/30 dark:bg-neutral-400/10",
      strong: "text-neutral-600 dark:text-neutral-300",
      soft: "text-neutral-500 dark:text-neutral-400",
      accent: "#a3a3a3",
      // Was "FREE", which was the most encouraging word on the page sitting on
      // the one band worth skipping — and a flat contradiction of the legend
      // three lines above it. Worded as the legend's own swatch now, so the key
      // and the block say the same thing.
      //
      // "Nobody" counts a group; on your own week there is nobody to count, and
      // the band is just the part of the day you have no reason to be in.
      tag: solo ? "OFF CAMPUS" : "NOBODY ON CAMPUS",
    };
  }
  return w.sharedCampus
    ? {
        box: "bg-emerald-400/30 ring-2 ring-inset ring-emerald-500/60",
        strong: "text-emerald-800 dark:text-emerald-200",
        soft: "text-emerald-800/80 dark:text-emerald-200/80",
        accent: "#10b981",
        // The group's version says what the colour means; the solo one says
        // what the band is, because with one schedule on screen there is no
        // group, just a gap in your own day. "GAP · ALL FREE" was shorthand
        // that assumed you already knew how the grid worked.
        tag: solo ? "BETWEEN CLASSES" : "EVERYONE FREE",
      }
    : {
        box: "bg-amber-300/25 ring-2 ring-inset ring-amber-500/50",
        strong: "text-amber-800 dark:text-amber-200",
        soft: "text-amber-800/80 dark:text-amber-200/80",
        accent: "#f59e0b",
        tag: solo ? "BETWEEN CLASSES" : "SPLIT CAMPUS",
      };
}

/** "Ann, Bo, Cy" — and "+2" past three, so the block stays one line. */
function nameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/** 80 -> "1h 20m", 50 -> "50m" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface Member {
  id: number;
  displayName: string;
  color: string;
}

/**
 * Everything the grids need to let one person say whether they're going.
 *
 * Bundled rather than passed as five loose props because they're useless
 * apart: absent means read-only, which is exactly what a signed-out visitor or
 * a non-member sees, and there is no half of this worth having on its own.
 */
export type AttendancePickOpts = { repeat?: boolean };

export interface AttendanceControl {
  /** The viewer's own member row. Only their blocks carry the control. */
  memberId: number;
  /** Their colour, for the accent on a whole-day card. */
  color: string;
  /** Their whole-day statuses this week, keyed by weekday. */
  dayStatus: Partial<Record<DayKey, { status: AttendanceStatus; note: string | null }>>;
  /** "Monday, Sep 14" — the page owns the dates, so it owns the wording. */
  dayLabel: (day: DayKey) => string;
  setBlock: (
    block: BusyBlock,
    status: AttendanceStatus,
    note: string | null,
    opts?: AttendancePickOpts
  ) => void | Promise<void>;
  setDay: (
    day: DayKey,
    status: AttendanceStatus,
    note: string | null,
    opts?: AttendancePickOpts
  ) => void | Promise<void>;
}

interface Entry {
  /** Everyone sitting in this exact section at this exact hour. */
  members: Member[];
  block: BusyBlock;
}

interface Placed extends Entry {
  /** Column inside its overlap cluster, and how many columns that cluster has. */
  column: number;
  columns: number;
  /** Columns it stretches across — empty neighbours to its right. */
  span: number;
}

/**
 * Lay one day out by what actually overlaps, not by who owns it. Classes that
 * clash split the width between them; a class with nothing beside it takes the
 * whole column, which is most of them — a fixed lane per member left every
 * block a sliver of the day wide for no reason.
 *
 * Blocks are grouped into clusters of transitively overlapping classes, and
 * columns are assigned greedily inside each cluster, so a busy hour never
 * narrows the rest of the day.
 */
/**
 * One block per section, not per person. Two people in CMPT 479 D100 are in
 * the same room at the same hour — drawing that twice both wastes the width
 * and hides the fact that they're already together. Custom busy time never
 * merges: it has no class number, and two people's "Busy" is not one event.
 */
function mergeSameSection(entries: { member: Member; block: BusyBlock }[]): Entry[] {
  const merged: Entry[] = [];
  const byKey = new Map<string, Entry>();

  for (const { member, block } of entries) {
    if (block.classNumber === undefined) {
      merged.push({ members: [member], block });
      continue;
    }
    // The status is part of the key, not just the section: two people in one
    // lecture are only "already together" if both of them are going. Without
    // this, one person skipping would be swallowed by the block of everyone
    // who isn't, and the grid would show them in a room they aren't in.
    const key = `${block.classNumber}|${block.start}|${block.end}|${block.status ?? "going"}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(member);
    } else {
      const entry: Entry = { members: [member], block };
      byKey.set(key, entry);
      merged.push(entry);
    }
  }
  return merged;
}

function packDay(entries: Entry[]): Placed[] {
  const sorted = [...entries].sort(
    (a, b) => a.block.start - b.block.start || a.block.end - b.block.end
  );

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  let lanes: number[] = []; // end time of the last block in each column

  function closeCluster() {
    for (const p of cluster) {
      p.columns = lanes.length;
      // Grow right while the next column has nothing running at this hour, so
      // a class alone at 2pm isn't a sliver just because 10am was busy.
      while (
        p.column + p.span < lanes.length &&
        !cluster.some(
          (q) =>
            q !== p &&
            q.column === p.column + p.span &&
            q.block.start < p.block.end &&
            q.block.end > p.block.start
        )
      ) {
        p.span++;
      }
    }
    placed.push(...cluster);
    cluster = [];
    lanes = [];
    clusterEnd = -Infinity;
  }

  for (const entry of sorted) {
    // Nothing in the cluster is still running, so this starts a fresh one.
    if (entry.block.start >= clusterEnd && cluster.length > 0) closeCluster();

    let column = lanes.findIndex((end) => end <= entry.block.start);
    if (column === -1) {
      column = lanes.length;
      lanes.push(entry.block.end);
    } else {
      lanes[column] = entry.block.end;
    }

    cluster.push({ members: entry.members, block: entry.block, column, columns: 1, span: 1 });
    clusterEnd = Math.max(clusterEnd, entry.block.end);
  }
  if (cluster.length > 0) closeCluster();

  return placed;
}

interface Props {
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  dayStart: number;
  dayEnd: number;
  /** One person's week: labels drop the group framing. */
  solo?: boolean;
  /** Monday of the week on screen, as YYYY-MM-DD — places the "now" line. */
  weekStart?: string;
  /**
   * Course code -> colour. Given on a single person's week, where every block
   * would otherwise be the one member colour and the courses were impossible
   * to tell apart at a glance. Absent on a group's week, where the colour has
   * to keep meaning "whose block this is".
   */
  courseColors?: Record<string, string>;
  /** A section being considered, drawn over the week but not part of it. */
  preview?: BusyBlock[];
  /** Whose it would be — the preview borrows their colour. */
  previewColor?: string;
  /**
   * Lets the viewer say whether they're actually going. Absent for anyone who
   * isn't in the group — and for everyone else's blocks, because a status is a
   * claim about yourself.
   */
  attendance?: AttendanceControl;
  /**
   * Height of the day columns. Defaults to the shared COLUMN_HEIGHT, which is
   * what keeps this and the heatmap the same size behind their toggle — only
   * pass something else where the two are swapped against each other outside
   * the group page, like the home page demo, and pass HeatGrid the same value.
   */
  columnHeight?: string;
}

export function WeekGrid({
  members,
  busyByMember,
  free,
  dayStart,
  dayEnd,
  solo = false,
  weekStart,
  courseColors,
  preview = [],
  previewColor = "#737373",
  attendance,
  columnHeight = COLUMN_HEIGHT,
}: Props) {
  // Tracked in state rather than a CSS-only tooltip: the day columns clip their
  // overflow, so an in-flow tooltip would be cut off at the column edge. A
  // fixed-position card follows the cursor and escapes the clipping entirely.
  const hover = useHoverCard();
  const now = useNowMarker(weekStart, dayStart, dayEnd);
  const { trackRef, todayIndex } = useTodayColumn(weekStart);

  const span = dayEnd - dayStart;
  const pct = (mins: number) => ((mins - dayStart) / span) * 100;
  const heightPct = (mins: number) => (mins / span) * 100;

  const withSchedules = members.filter((m) => (busyByMember[m.id] ?? []).length > 0);

  // One packed layout per day, reused by the render below.
  const placedByDay = new Map<DayKey, Placed[]>();
  for (const day of WEEKDAYS) {
    const entries = withSchedules.flatMap((member) =>
      (busyByMember[member.id] ?? [])
        .filter((b) => b.day === day)
        .map((block) => ({ member, block }))
    );
    // Merging happens after the member filter, so unticking someone in
    // the group list splits a shared block back apart on the same render.
    placedByDay.set(day, packDay(mergeSameSection(entries)));
  }

  // The widest clash in the week decides how much room a column needs; most
  // days are far narrower than the member count would have suggested.
  const maxColumns = Math.max(
    1,
    ...[...placedByDay.values()].map((ps) => Math.max(1, ...ps.map((p) => p.columns)))
  );

  // Past three columns a course code no longer fits at the roomier size, so the
  // type and padding tighten rather than letting "CMPT 307" clip mid-word.
  const tight = maxColumns >= 4;

  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);

  return (
    <div className={GRID_SCROLLER}>
      {/* Fixed height, and matched by the heatmap's own legend, so switching
          between the two views doesn't move the page under you. */}
      <div
        className={`mb-2 flex flex-col items-center justify-center gap-1 text-xs ${LEGEND_HEIGHT}`}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {[
            { box: "bg-emerald-400/30 ring-2 ring-inset ring-emerald-500/60", label: solo ? "Between classes" : "Everyone free" },
            ...(solo ? [] : [{ box: "bg-amber-300/25 ring-2 ring-inset ring-amber-500/50", label: "Split campus" }]),
            { box: "bg-neutral-400/10 ring-1 ring-inset ring-neutral-400/30", label: solo ? "Off campus" : "Nobody on campus" },
          ].map((k) => (
            <span key={k.label} className="flex items-center gap-1 text-neutral-500">
              <span className={`h-3.5 w-6 rounded-sm ${k.box}`} />
              {k.label}
            </span>
          ))}
        </div>
        <span className="text-neutral-400 dark:text-neutral-500">
          Coloured blocks are classes · dashed = skipping, dot = online
          {attendance ? " · hover yours to change" : " · hover one for details"}
        </span>
      </div>

      <div className="flex gap-2 text-xs">
        {/* Hour gutter. The empty header mirrors the day-name row so the hour
            labels line up with the grid lines instead of sitting a row high. */}
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
          {WEEKDAYS.map((day, i) => {
            const dayFree = free.filter((w) => w.day === day);
            const isToday = i === todayIndex;
            return (
              <div key={day} className={DAY_CELL}>
                <DayHeading
                  day={day}
                  isToday={isToday}
                  attendance={attendance}
                  hover={hover}
                />
                <div
                  className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${columnHeight}`}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                      style={{ top: `${pct(h)}%` }}
                    />
                  ))}

                  {/* Free windows sit behind the busy bands. Gaps between
                      classes are the ones worth spotting, so they carry the
                      colour; the rest stay grey.

                      Inset and rounded exactly like a class block. A window is
                      one more shape stacked in the column, and drawing it
                      square and full-bleed between two rounded blocks read as a
                      rendering fault rather than a distinction. Corners round on
                      all four sides safely: commonFree returns *maximal*
                      windows, so two of them can never abut — there is always a
                      class in between, and never a seam to notch. */}
                  {dayFree.map((w, i) => {
                    const minutes = w.end - w.start;
                    const tone = freeStyle(w, solo);
                    return (
                      <div
                        key={`free-${i}`}
                        /* A size container, so the labels below can ask how
                           much room they actually have — see the hides on each
                           of them. overflow-hidden is the floor under that: a
                           band 40px tall is never allowed to print three lines
                           of text over the classes either side of it, which is
                           what a minutes-only threshold let it do on the
                           shorter grid at /courses. */
                        className={`absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 text-center [container-type:size] ${tone.box}`}
                        style={{
                          top: `calc(${pct(w.start)}% + ${GAP_Y / 2}px)`,
                          height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                          left: GAP_X / 2,
                          right: GAP_X / 2,
                        }}
                        onMouseEnter={(e) =>
                          hover.show({
                            title: w.betweenClasses ? "Gap between classes" : solo ? "Your free time" : "Everyone free",
                            subtitle: LABELS[day],
                            lines: [
                              `${formatTime(w.start)} – ${formatTime(w.end)} · ${formatDuration(minutes)}`,
                              w.onCampus.length === 0
                                ? solo ? "You have no class this day" : "Nobody has class this day — someone has to travel"
                                // Present tense only when they're actually there:
                                // outside the gaps this window is before the first
                                // class or after the last, and campus has emptied.
                                : {
                                    label: w.betweenClasses ? "On campus" : "Has class today",
                                    value: w.onCampus.join(", "),
                                  },
                              // Only the split is worth a row: one campus is
                              // the ordinary case, and saying it on every card
                              // is a line you learn to skip. Two means they
                              // can't actually meet.
                              ...(w.sharedCampus ? [] : [`Split across ${w.campuses.join(" and ")}`]),
                            ],
                            accent: tone.accent,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) => hover.move(e.clientX, e.clientY)}
                        onMouseLeave={() => hover.hide()}
                      >
                        {minutes >= 60 && (
                          <>
                            {/* The tag is two words on the narrow columns a
                                phone or the /courses grid gives it, so it wraps
                                before it truncates — which doubles its height
                                and is what actually overflowed. It goes first
                                when room runs out, because the colour has
                                already said the same thing. */}
                            <span
                              className={`text-[10px] font-semibold tracking-wide [@container(max-height:2.6rem)]:hidden ${tone.strong}`}
                            >
                              {tone.tag}
                            </span>
                            <span
                              className={`text-[10px] tabular-nums [@container(max-height:1.4rem)]:hidden ${tone.soft}`}
                            >
                              {formatTime(w.start)}–{formatTime(w.end)}
                            </span>
                            {/* Who's already on campus matters more than where,
                                so names take the next line and the campus only
                                shows when the block is tall enough for both.

                                Neither line belongs on the grey band: those
                                names are people who have class *that day*, and
                                printing them under "NOBODY ON CAMPUS" reads as
                                a flat contradiction. The hover still says who,
                                with the wording that tense needs. */}
                            {w.betweenClasses && minutes >= 90 && w.onCampus.length > 0 && (
                              <span
                                className={`w-full truncate text-[10px] font-medium [@container(max-height:3.8rem)]:hidden ${tone.strong}`}
                              >
                                {nameList(w.onCampus)}
                              </span>
                            )}
                            {w.betweenClasses && minutes >= 130 && w.campuses.length > 0 && (
                              <span
                                className={`text-[10px] [@container(max-height:5rem)]:hidden ${tone.soft}`}
                              >
                                {w.campuses.join(" / ")}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Blocks share width only with what they overlap. */}
                  {(placedByDay.get(day) ?? []).map(({ members: who, block: b, column, columns, span }, bi) => {
                    const minutes = b.end - b.start;
                    const unit = 100 / columns;
                    const width = unit * span;
                    const shared = who.length > 1;
                    const fill = courseColors?.[b.course] ?? who[0].color;
                    // Skipping hollows the block out: dashed outline, no fill,
                    // neutral text — which is what border-dashed already means
                    // everywhere else on this page. Filling it and dimming it
                    // instead left white text on a pastel wash, unreadable at
                    // the size these get.
                    const skipped = b.status === "skipping";
                    // Merged blocks are one section several people share, so
                    // "mine" only needs the viewer among them — the status the
                    // card writes is theirs alone either way.
                    const mine =
                      attendance !== undefined &&
                      b.classNumber !== undefined &&
                      who.some((m) => m.id === attendance.memberId);
                    const body = skipped ? "text-neutral-500" : "text-white/95";
                    const faint = skipped
                      ? "text-neutral-400 dark:text-neutral-500"
                      : "text-white/80";

                    // The card says what the class is; on your own block it
                    // also carries the answer to whether you're going, which is
                    // the next thing you were going to want anyway.
                    const blockCard = (x: number, y: number): HoverCardData => ({
                      title: b.course,
                      subtitle: b.detail || undefined,
                      lines: [
                        ...(solo ? [] : [who.map((m) => m.displayName).join(", ")]),
                        `${formatTime(b.start)} – ${formatTime(b.end)} · ${formatDuration(minutes)}`,
                        // Attending from home makes the scheduled campus a
                        // place they won't be, so it says the truth instead.
                        b.status === "remote" ? "Online" : b.campus ?? "No campus listed",
                        // On your own block the lit button says the status and
                        // the note is sitting in the box below, so neither is
                        // worth a line here — the card would be saying
                        // everything twice.
                        ...(mine || b.status !== "skipping" ? [] : ["Not going"]),
                        // Only on an unmerged block: a merged one is several
                        // people who happen to share a status, and one of their
                        // notes isn't the others'.
                        ...(b.note && !shared && !mine ? [b.note] : []),
                        ...(shared && b.status !== "skipping" ? ["Same section"] : []),
                      ],
                      accent: fill,
                      x,
                      y,
                      status:
                        mine && attendance
                          ? {
                              current: b.status ?? "going",
                              note: b.note ?? null,
                              onPick: (status, note, opts) =>
                                attendance.setBlock(b, status, note, opts),
                              allowRepeat: true,
                            }
                          : undefined,
                    });

                    return (
                      <div
                        key={`${who[0].id}-${bi}`}
                        // Focusable, not a button: it opens on hover, and the
                        // keyboard needs some way to reach a control the mouse
                        // gets for free. Tab lands here, the card opens, and
                        // the next Tab is already inside it.
                        tabIndex={mine ? 0 : undefined}
                        className={`absolute flex flex-col overflow-hidden rounded-md leading-tight ${
                          tight ? "px-1 py-0.5" : "px-1.5 py-1"
                        } ${shared ? "pl-2.5" : ""} ${
                          skipped
                            ? "border-2 border-dashed"
                            : `text-white ${shared ? "bg-neutral-700 dark:bg-neutral-600" : ""}`
                        } ${mine ? "hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current" : ""}`}
                        style={{
                          top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                          height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                          left: `calc(${column * unit}% + ${GAP_X / 2}px)`,
                          width: `calc(${width}% - ${GAP_X}px)`,
                          backgroundColor: skipped || shared ? undefined : fill,
                          borderColor: skipped ? fill : undefined,
                        }}
                        onFocus={
                          mine
                            ? (e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                hover.show(blockCard(r.left, r.top));
                              }
                            : undefined
                        }
                        onBlur={mine ? () => hover.hide(CROSS_MS) : undefined}
                        onMouseEnter={(e) => hover.show(blockCard(e.clientX, e.clientY))}
                        onMouseMove={(e) => hover.move(e.clientX, e.clientY)}
                        onMouseLeave={() => hover.hide(mine ? CROSS_MS : 0)}
                      >
                        {/* A shared block has no single owner, so the colours
                            move to a stripe down the edge and the fill goes
                            neutral — you can still scan the column for a person. */}
                        {shared && (
                          <span className="absolute inset-y-0 left-0 flex w-1.5 flex-col overflow-hidden rounded-l-md">
                            {who.map((m) => (
                              <span key={m.id} className="flex-1" style={{ backgroundColor: m.color }} />
                            ))}
                          </span>
                        )}
                        {/* A class attended from home still occupies its hour,
                            so the block keeps its fill; the dot is the only
                            thing separating it from being there in person. */}
                        {b.status === "remote" && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white ring-1 ring-black/20" />
                        )}
                        <span
                          className={`truncate font-semibold ${tight ? "text-[10px]" : "text-[11px]"} ${
                            skipped ? "text-neutral-500 line-through" : ""
                          }`}
                        >
                          {b.course}
                        </span>
                        {/* Whose block it is matters more than the section
                            code, so the names get the second line and the
                            section only appears when there's room for it.
                            On one person's week there is no name worth
                            printing — it could only be them, and the colour
                            says which course it is — so the section moves up
                            into the line the name was using. */}
                        {!solo && minutes >= 50 && (
                          <span className={`truncate font-medium ${body} ${tight ? "text-[9px]" : "text-[10px]"}`}>
                            {nameList(who.map((m) => m.displayName), shared ? 2 : 1)}
                          </span>
                        )}
                        {b.detail && minutes >= (solo ? 50 : 80) && (
                          <span className={`truncate ${faint} ${tight ? "text-[9px]" : "text-[10px]"}`}>
                            {b.detail}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Drawn over the week at full width and never packed with
                      it: this section isn't yours yet, and squeezing the real
                      blocks aside for something you might not add would make
                      the grid jump under the cursor. */}
                  {preview
                    .filter((b) => b.day === day)
                    .map((b, pi) => {
                      const minutes = b.end - b.start;
                      return (
                        <div
                          key={`preview-${pi}`}
                          className="pointer-events-none absolute z-10 flex flex-col justify-center overflow-hidden rounded-md border-2 border-dashed px-1.5 py-1 leading-tight backdrop-blur-[1px]"
                          style={{
                            top: `calc(${pct(b.start)}% + ${GAP_Y / 2}px)`,
                            height: `calc(${heightPct(minutes)}% - ${GAP_Y}px)`,
                            left: GAP_X / 2,
                            right: GAP_X / 2,
                            borderColor: previewColor,
                            backgroundColor: `${previewColor}59`,
                          }}
                        >
                          <span className="truncate text-[10px] font-semibold text-white">
                            {b.course}
                          </span>
                          {minutes >= 50 && (
                            <span className="truncate text-[9px] font-medium text-white/90">
                              {b.detail}
                            </span>
                          )}
                        </div>
                      );
                    })}

                  {now?.day === day && <NowLine top={pct(now.minutes)} minutes={now.minutes} />}
                </div>
              </div>
            );
          })}
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
