"use client";

import { WeekGrid } from "@/components/WeekGrid";
import { groupConflicts, type Conflict } from "@/lib/conflicts";
import type { BusyBlock, FreeWindow, UnscheduledSection } from "@/lib/overlap";
import { formatTime, fromTermCode, type DayKey } from "@/lib/sfu";

/**
 * What the page needs out of /api/me/schedule. A structural subset of SoloState
 * rather than the whole thing: this view has no week picker and no attendance
 * controls, so the dates and statuses that come back with it are none of its
 * business.
 */
export interface PreviewState {
  classNumbers: string[];
  busy: BusyBlock[];
  free: FreeWindow[];
  unscheduled: UnscheduledSection[];
  week: string;
}

/**
 * Same roster of one SoloWeek uses. The id is arbitrary — nothing here writes
 * against a member row, because nothing here writes at all.
 */
const ME = { id: 0, displayName: "You", color: "#3b82f6" };

/** Shorter than the full-page grid: this one sits beside a search box. */
const PREVIEW_HEIGHT = "h-[380px] sm:h-[440px] lg:h-[520px]";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

/**
 * Your week, drawn while you're still typing it in.
 *
 * /courses used to be a search box over a row of chips, which is a form with
 * its output missing — you added five sections and saw five labels, and the
 * thing you were actually building stayed invisible until you left the page.
 * The same grid the rest of the app draws goes here instead, read-only: no
 * paging, no attendance, nothing to press. It's the receipt for the typing.
 *
 * Read-only is also what makes it affordable. WeekGrid's interactive half is
 * all in `attendance`, which is optional, so leaving it off costs nothing and
 * leaves one grid implementation rather than a second, smaller one to keep in
 * step.
 */
export function WeekPreview({
  term,
  state,
  loading,
  error,
  courseColors,
  conflicts,
  preview = [],
}: {
  term: string;
  /** Null until the first answer lands, and while a term switch is in flight. */
  state: PreviewState | null;
  loading: boolean;
  error: string | null;
  /** Course code -> colour, so the cards beside the grid can use the same one. */
  courseColors?: Record<string, string>;
  conflicts: Conflict[];
  /** A section under the cursor in the search results, sketched over the week. */
  preview?: BusyBlock[];
}) {
  const nothingSaved = state !== null && state.classNumbers.length === 0;
  // The empty state is the wrong thing to show while a section is being
  // considered — the first add is exactly when seeing where it lands is worth
  // most, and a placeholder that said "add a section and it appears here" would
  // be covering the answer to that.
  const empty = nothingSaved && preview.length === 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Your week</h2>
        <span className="text-xs text-neutral-500">{fromTermCode(term)}</span>
      </div>

      {error ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-amber-600 dark:border-neutral-700">
          {error}
        </p>
      ) : empty ? (
        // Deliberately the same box as the grid it replaces, roughly: a panel
        // that collapses to one line while empty and then shoves the page
        // around on the first add is worse than one that says what it's for.
        <p className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Add a section and it appears here.
        </p>
      ) : (
        <>
          <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <WeekGrid
              members={[ME]}
              busyByMember={{ [ME.id]: state?.busy ?? [] }}
              free={state?.free ?? []}
              dayStart={8 * 60}
              dayEnd={22 * 60}
              solo
              weekStart={state?.week}
              courseColors={courseColors}
              preview={preview}
              columnHeight={PREVIEW_HEIGHT}
            />
          </div>

          {/* Under the grid rather than over it, because the grid is where you
              see the clash — this only names it, for the case where the two
              blocks are narrow enough to be easy to miss. */}
          {conflicts.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {groupConflicts(conflicts).map((c) => (
                <li key={`${c.a.classNumber}-${c.b.classNumber}-${c.start}`}>
                  <span className="font-medium">{c.a.course} {c.a.detail}</span> and{" "}
                  <span className="font-medium">{c.b.course} {c.b.detail}</span> overlap{" "}
                  {c.days.map((d) => LABELS[d]).join(" and ")}{" "}
                  {formatTime(c.start)}–{formatTime(c.end)}.
                </li>
              ))}
            </ul>
          )}

          {state && state.unscheduled.length > 0 && (
            <p className="text-xs text-neutral-500">
              {state.unscheduled.length} section
              {state.unscheduled.length === 1 ? " has" : "s have"} no meeting time, so
              {state.unscheduled.length === 1 ? " it isn't" : " they aren't"} on the grid.
            </p>
          )}
        </>
      )}
    </section>
  );
}
