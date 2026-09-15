"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WeekGrid, type AttendanceControl } from "@/components/WeekGrid";
import type { AttendanceRow, AttendanceStatus } from "@/lib/attendance-status";
import { courseColors } from "@/lib/course-color";
import { weekDates, type BusyBlock, type FreeWindow, type TermBounds, type UnscheduledSection } from "@/lib/overlap";
import { WEEKDAYS, fromTermCode, type DayKey } from "@/lib/sfu";
import { addDays, mondayOf, shortDate, writeDate } from "@/lib/week-dates";

/** What /api/me/schedule answers with — see getSoloState in lib/user-courses.ts. */
interface SoloState {
  term: string;
  classNumbers: string[];
  busy: BusyBlock[];
  free: FreeWindow[];
  unresolved: string[];
  unscheduled: UnscheduledSection[];
  week: string;
  termBounds: TermBounds | null;
  attendance: AttendanceRow[];
}

// The same three constants the group page fixes, for the same reasons: nothing
// shorter than an hour is worth crossing campus for, and nobody was going to
// tune the window.
const MIN_MINUTES = 60;
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

/**
 * One member row, for a page that has none.
 *
 * WeekGrid draws a roster, because it was written for a group; a person
 * looking at their own week is a roster of one. The id is arbitrary and never
 * leaves this component — nothing here writes against a member row, since
 * attendance has always been keyed on the user and the date.
 */
const ME = { id: 0, displayName: "You", color: "#3b82f6" };

/**
 * Your own week, with no group behind it.
 *
 * /my-schedule used to redirect into a group and, failing that, tell you to go
 * and join one — which stopped being a reasonable answer once /courses let you
 * save a schedule first. Everything a group page does that needs other people
 * is absent: no member list, no availability shading, no invite link. What's
 * left is the timetable you typed in, which is what the page was called after.
 */
export function SoloWeek({ startTerm, terms }: { startTerm: string; terms: string[] }) {
  const [term, setTerm] = useState(startTerm);
  const [week, setWeek] = useState<string | null>(null);
  const [state, setState] = useState<SoloState | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * What the newest request was for. Paging a week or switching a term starts
   * another fetch without cancelling the last, and the two can come back in
   * either order — an older answer landing second would draw one week under
   * another week's heading, since `setWeek` below keeps whichever is already
   * set. Comparing against this drops the answer nobody is waiting for any
   * more.
   */
  const wanted = useRef<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ term });
    if (week) params.set("week", week);
    const asked = params.toString();
    wanted.current = asked;
    const res = await fetch(`/api/me/schedule?${params}`);
    if (wanted.current !== asked) return;
    if (!res.ok) {
      setError(
        res.status === 502
          ? `${fromTermCode(term)} isn't published by SFU yet, so there's nothing to draw.`
          : "Could not load your schedule."
      );
      return;
    }
    const next: SoloState = await res.json();
    if (wanted.current !== asked) return;
    setError(null);
    setState(next);
    // First load, and every term switch: adopt the week the server clamped to,
    // so a term that hasn't started opens on its first week rather than on an
    // empty grid.
    setWeek((cur) => cur ?? next.week);
  }, [term, week]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function switchTerm(next: string) {
    // Anything still in flight was asked for the old term; nulling this means
    // its answer is discarded rather than drawn under the new term's heading.
    wanted.current = null;
    setTerm(next);
    // Dropped, not kept: a week in the fall term means nothing in the spring
    // one, and the next load clamps to whatever that term's bounds allow.
    setWeek(null);
    setState(null);
  }

  /**
   * The five dates on screen. A status is about a date rather than about
   * "Thursday" in the abstract, so every read and write goes through this.
   */
  const dates = useMemo(
    () => (state ? weekDates(new Date(`${state.week}T12:00:00`)) : null),
    [state]
  );

  const myCourseColors = useMemo(() => {
    if (!state) return undefined;
    return courseColors([
      ...state.busy.filter((b) => b.classNumber !== undefined).map((b) => b.course),
      ...state.unscheduled.map((s) => s.course),
    ]);
  }, [state]);

  /** Your whole-day statuses this week, for the day headings. */
  const dayStatus = useMemo(() => {
    const out: Partial<Record<DayKey, { status: AttendanceStatus; note: string | null }>> = {};
    if (!state || !dates) return out;
    for (const day of WEEKDAYS) {
      const row = state.attendance.find((r) => r.classNumber === null && r.onDate === dates[day]);
      if (row) out[day] = { status: row.status, note: row.note };
    }
    return out;
  }, [state, dates]);

  async function saveStatus(
    date: string,
    classNumber: string | null,
    status: AttendanceStatus,
    note: string | null,
    opts?: { repeat?: boolean }
  ) {
    const res = await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        classNumber,
        status,
        note,
        repeat: opts?.repeat === true,
        until: opts?.repeat ? state?.termBounds?.end ?? undefined : undefined,
      }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "could not save that"); return; }
    setError(null);
    load();
  }

  const attendance: AttendanceControl | undefined = dates
    ? {
        memberId: ME.id,
        color: ME.color,
        dayStatus,
        dayLabel: (day) => writeDate(dates[day]),
        setBlock: (block, status, note, opts) =>
          saveStatus(dates[block.day], block.classNumber ?? null, status, note, opts),
        setDay: (day, status, note, opts) => saveStatus(dates[day], null, status, note, opts),
      }
    : undefined;

  const thisMonday = mondayOf(new Date());

  function weekInTerm(monday: string): boolean {
    const b = state?.termBounds;
    if (!b) return true;
    return addDays(monday, 6) >= b.start && monday <= b.end;
  }

  function canPage(direction: -1 | 1): boolean {
    return week !== null && weekInTerm(addDays(week, direction * 7));
  }

  const coursesHref = `/courses?term=${term}&next=${encodeURIComponent("/my-schedule")}`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your schedule</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {fromTermCode(term)}. Only your own classes — join a group to see when
            you and other people are free at the same time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {terms.length > 1 && (
            <select
              value={term}
              onChange={(e) => switchTerm(e.target.value)}
              aria-label="Term"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {terms.map((t) => (
                <option key={t} value={t}>{fromTermCode(t)}</option>
              ))}
            </select>
          )}
          <Link
            href={coursesHref}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Edit courses
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-amber-600">{error}</p>}

      {state && state.classNumbers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-500 dark:border-neutral-700">
          Nothing saved for {fromTermCode(term)}.{" "}
          <Link href={coursesHref} className="text-blue-600 hover:underline dark:text-blue-400">
            Add your courses
          </Link>{" "}
          and your week appears here.
        </p>
      ) : (
        <>
          {state && !weekInTerm(thisMonday) && (
            <p className="text-xs text-neutral-500">
              Today falls outside {fromTermCode(term)}, so this starts at the first
              week of term.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => week && setWeek(addDays(week, -7))}
              disabled={!canPage(-1)}
              aria-label="Previous week"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              ←
            </button>
            <span className="min-w-[12rem] text-center text-lg font-medium tabular-nums">
              {week ? `${shortDate(week)} – ${shortDate(addDays(week, 4))}` : "—"}
            </span>
            <button
              onClick={() => week && setWeek(addDays(week, 7))}
              disabled={!canPage(1)}
              aria-label="Next week"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              →
            </button>
            {week !== thisMonday && weekInTerm(thisMonday) && (
              <button
                onClick={() => setWeek(thisMonday)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                This week
              </button>
            )}
          </div>

          <WeekGrid
            members={[ME]}
            busyByMember={{ [ME.id]: state?.busy ?? [] }}
            free={state?.free ?? []}
            dayStart={DAY_START}
            dayEnd={DAY_END}
            solo
            weekStart={week ?? undefined}
            courseColors={myCourseColors}
            attendance={attendance}
          />

          {state && state.unscheduled.length > 0 && (
            <section>
              <h2 className="mb-1 font-medium">Async Classes</h2>
              <p className="mb-2 text-xs text-neutral-500">
                Online, async, co-op and independent study sections. They have no
                timetable slot, so they don&apos;t appear on the grid.
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {state.unscheduled.map((sec) => (
                  <li
                    key={sec.classNumber}
                    className="flex items-baseline gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-sm"
                      style={{ backgroundColor: myCourseColors?.[sec.course] ?? ME.color }}
                    />
                    <span className="font-medium">{sec.course}</span>
                    <span className="text-xs text-neutral-500">
                      {sec.section}{sec.sectionCode ? ` ${sec.sectionCode}` : ""}
                    </span>
                    {sec.deliveryMethod && sec.deliveryMethod !== "In Person" && (
                      <span className="ml-auto text-xs text-blue-600 dark:text-blue-400">
                        {sec.deliveryMethod}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* MIN_MINUTES is the server's, not a control — named here so the number
          isn't a mystery when a 45-minute gap doesn't light up. */}
      <p className="text-xs text-neutral-500">
        Gaps shorter than {MIN_MINUTES} minutes aren&apos;t shown.
      </p>
    </main>
  );
}
