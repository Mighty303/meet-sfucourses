import type { BusyBlock } from "./overlap";
import type { DayKey } from "./sfu";

/**
 * Two of your own classes in the same hour.
 *
 * Everything else in this file's neighbourhood is about time you *share* with
 * other people; this is the one question you can only ask of a single
 * schedule, which is why nothing computed it before /courses existed. SFU will
 * happily enrol you in a lecture and a tutorial that collide, and until now the
 * first you'd hear of it was seeing two blocks stacked on the grid.
 */
export interface Conflict {
  day: DayKey;
  /** The overlapping slice itself, not either class's own hours. */
  start: number;
  end: number;
  a: BusyBlock;
  b: BusyBlock;
}

/**
 * Every pair of blocks that share a minute, once per pair.
 *
 * Quadratic, deliberately: a schedule is five to ten sections a week, and a
 * sweep line would cost more to read than it saves to run. Pass blocks you
 * actually attend — `attending` in lib/overlap drops the ones marked skipped,
 * and a class you've said you're not going to isn't a clash.
 *
 * A block with no class number is custom busy time. Those can overlap a class
 * on purpose ("blocked out for work"), so they're left out of this entirely.
 */
export function findConflicts(blocks: BusyBlock[]): Conflict[] {
  const sections = blocks.filter((b) => b.classNumber !== undefined);
  const out: Conflict[] = [];

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      if (a.day !== b.day) continue;
      // The same section twice is the same class, not a clash with itself.
      if (a.classNumber === b.classNumber) continue;

      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      // Touching isn't overlapping: a class ending at 11:20 and one starting at
      // 11:20 is a normal back-to-back day, not a problem to report.
      if (start >= end) continue;

      out.push({ day: a.day, start, end, a, b });
    }
  }

  return out;
}

/**
 * The sections involved in any clash, for marking them in a list where there's
 * no room to say what they clash with.
 */
export function conflictedClassNumbers(conflicts: Conflict[]): Set<string> {
  const out = new Set<string>();
  for (const c of conflicts) {
    if (c.a.classNumber) out.add(c.a.classNumber);
    if (c.b.classNumber) out.add(c.b.classNumber);
  }
  return out;
}

/**
 * The same two classes clashing on Monday and again on Wednesday is one thing
 * to fix, not two — and a lecture that meets twice a week is the common case,
 * so reporting it per day fills a panel with a sentence and its own echo.
 * Grouped by the pair and the hours they share; a pair that clashes at two
 * different times still gets a line each, because those are two facts.
 */
export interface GroupedConflict {
  a: BusyBlock;
  b: BusyBlock;
  start: number;
  end: number;
  days: DayKey[];
}

export function groupConflicts(conflicts: Conflict[]): GroupedConflict[] {
  const byPair = new Map<string, GroupedConflict>();

  for (const c of conflicts) {
    // Sorted, so the same pair keys the same way whichever block came first.
    const pair = [c.a.classNumber, c.b.classNumber].sort().join("-");
    const key = `${pair}-${c.start}-${c.end}`;
    const seen = byPair.get(key);
    if (seen) {
      if (!seen.days.includes(c.day)) seen.days.push(c.day);
      continue;
    }
    byPair.set(key, { a: c.a, b: c.b, start: c.start, end: c.end, days: [c.day] });
  }

  return [...byPair.values()];
}
