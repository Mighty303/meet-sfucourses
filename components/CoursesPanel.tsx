"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { CoursePicker } from "@/components/CoursePicker";
import { SavedCourses } from "@/components/SavedCourses";
import { WeekPreview, type PreviewState } from "@/components/WeekPreview";
import { conflictedClassNumbers, findConflicts } from "@/lib/conflicts";
import { courseColors } from "@/lib/course-color";
import { removeCourse } from "@/lib/course-writes";
import { attending } from "@/lib/overlap";
import { fromTermCode, termOptions } from "@/lib/sfu";

/**
 * The body of /courses: a term, a search box, and the week the two of them add
 * up to.
 *
 * Holds the term in state rather than in the URL. Switching terms is something
 * you do to check what you saved last spring, not somewhere you navigate to,
 * and a round trip per switch would put a blank page between the two lists.
 * The server still honours `?term=` on arrival — that's for links that already
 * know which term they mean.
 */
export function CoursesPanel({
  startTerm,
  startCourses,
  startSchedule,
  next,
}: {
  startTerm: string;
  /** Resolved on the server for `startTerm`, so the first paint is the real list. */
  startCourses: string[];
  /**
   * The week for `startTerm`, drawn on the server for the same reason. Null
   * when SFU hasn't published that term's timetable, which is the one case the
   * grid can't be drawn from a saved schedule alone.
   */
  startSchedule: PreviewState | null;
  /** Where Continue and Skip both go. Already through safeNext. */
  next: string;
}) {
  const [term, setTerm] = useState(startTerm);
  // Null while a term's list is in flight, which is a different thing from an
  // empty one — the difference between "nothing saved" and "not yet known",
  // and the picker says so.
  const [courses, setCourses] = useState<string[] | null>(startCourses);
  const [schedule, setSchedule] = useState<PreviewState | null>(startSchedule);
  const [weekError, setWeekError] = useState<string | null>(null);
  // The section being removed from a card, so its × can't be pressed twice.
  const [removing, setRemoving] = useState<string | null>(null);
  // The term the newest request was for. Two switches in quick succession can
  // come back out of order, and the older answer must not overwrite the newer.
  const wanted = useRef(startTerm);

  /**
   * Re-read one term — after an edit, or after a switch.
   *
   * Both halves in one pass, because they are one answer: the saved list drives
   * the chips and the grid draws what those sections actually come to, so
   * refreshing either alone leaves the page briefly disagreeing with itself.
   * Takes the term rather than closing over it, so a switch can fetch the new
   * one without waiting a render for the state to catch up.
   */
  const load = useCallback(async (forTerm: string) => {
    wanted.current = forTerm;
    const [list, week] = await Promise.all([
      fetch(`/api/me/courses?term=${forTerm}`),
      fetch(`/api/me/schedule?term=${forTerm}`),
    ]);
    if (wanted.current !== forTerm) return;

    if (list.ok) setCourses((await list.json()).classNumbers);

    if (week.ok) {
      setWeekError(null);
      setSchedule(await week.json());
      return;
    }
    // 502 is the upstream gap the term switcher makes reachable: it offers next
    // year, and SFU publishes a timetable when it publishes it. Everything else
    // is ours, and says less because there's less to say.
    setSchedule(null);
    setWeekError(
      week.status === 502
        ? `SFU hasn't published the ${fromTermCode(forTerm)} timetable yet, so there's no week to draw.`
        : "Could not draw your week."
    );
  }, []);

  function switchTerm(next: string) {
    setTerm(next);
    setCourses(null);
    setSchedule(null);
    setWeekError(null);
    load(next);
  }

  /**
   * A colour per course, shared by the grid and the cards beside it — which is
   * what makes the cards a key to the grid rather than a second list of the
   * same names.
   */
  const colors = useMemo(() => {
    if (!schedule) return undefined;
    return courseColors([
      ...schedule.busy.filter((b) => b.classNumber !== undefined).map((b) => b.course),
      ...schedule.unscheduled.map((s) => s.course),
    ]);
  }, [schedule]);

  /**
   * Two of your own classes in the same hour.
   *
   * Over `attending`, so a class you've already marked skipped somewhere else
   * doesn't get reported as a clash you have to do something about. This is one
   * week of the term rather than all of them: two sections whose date ranges
   * don't overlap can share an hour without ever colliding, and the grid can
   * only show what it's drawing.
   */
  const conflicts = useMemo(
    () => (schedule ? findConflicts(attending(schedule.busy)) : []),
    [schedule]
  );
  const conflicted = useMemo(() => conflictedClassNumbers(conflicts), [conflicts]);

  // What you just did was fill in your own week, so the way out of here is that
  // week — the group's page narrowed to your row, which is what `view=mine` is.
  // Anything else is the home page, where the next thing to do is start or join
  // a group, so the button says that rather than "Continue", which would be a
  // button pointing at nothing.
  const toGroup = next.startsWith("/g/");
  const done = !toGroup || next.includes("view=mine")
    ? next
    : `${next}${next.includes("?") ? "&" : "?"}view=mine`;
  const saved = courses?.length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 pb-20 sm:pb-24">
      <div className="fade-up flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-lg">
          <h1 className="text-2xl font-semibold tracking-tight">Your courses</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Add the sections you&apos;re in — tutorials and labs are added separately
            from the lecture. One list per term, and every group you join that term
            reads from it.
          </p>
        </div>
        <select
          value={term}
          onChange={(e) => switchTerm(e.target.value)}
          aria-label="Term"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {/* The term you arrived on is always in the list, even if it's old
              enough to have fallen off the end of it — otherwise following
              "Edit courses" from a past group would silently switch terms. */}
          {(termOptions().includes(startTerm) ? termOptions() : [startTerm, ...termOptions()]).map((t) => (
            <option key={t} value={t}>{fromTermCode(t)}</option>
          ))}
        </select>
      </div>

      {/* The search on the left, what it builds on the right. Stacked below
          `lg`, search first: on a phone the grid is most of a screen, and
          putting it above the box would mean scrolling past your own week to
          add to it. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-start">
        <div className="fade-up flex min-w-0 flex-col gap-5" style={{ animationDelay: "120ms" }}>
          {/* Keyed on the term, which remounts it on a switch.
              Its search results are tagged by query alone and the chips cache
              their resolved sections, so without this the previous term's list
              stays on screen and clickable while the new term's is in flight —
              and pressing Add on one of those rows would file a fall section
              under spring. */}
          <CoursePicker
            key={term}
            term={term}
            target={{ via: "me" }}
            classNumbers={courses ?? []}
            loading={courses === null}
            showSaved={false}
            onChange={() => load(term)}
          />

          {/* Under the box rather than over it, which is the other half of the
              swap: adding and removing are the same job, and the list you're
              editing belongs next to the thing you edit it with. The colours
              are the grid's, so this doubles as its key. */}
          {saved > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight">
                Your sections{" "}
                <span className="font-normal text-neutral-500">({saved})</span>
              </h3>
              <SavedCourses
                term={term}
                classNumbers={courses ?? []}
                courseColors={colors}
                conflicted={conflicted}
                busy={removing}
                onRemove={async (classNumber) => {
                  setRemoving(classNumber);
                  await removeCourse({ via: "me" }, term, classNumber);
                  setRemoving(null);
                  load(term);
                }}
              />
            </section>
          )}
        </div>

        {/* Sticky, so the week stays put while the results list scrolls past
            it — the point of having it here at all is watching it fill in. */}
        <aside
          className="fade-up flex min-w-0 flex-col gap-4 lg:sticky lg:top-6"
          style={{ animationDelay: "240ms" }}
        >
          <WeekPreview
            term={term}
            state={schedule}
            loading={courses === null}
            error={weekError}
            courseColors={colors}
            conflicts={conflicts}
          />

          {/* Skip is a link, not a lesser button: this step is a suggestion
              about what to do first, and dressing the way past it as a control
              to defeat would make it look like one. */}
          <div className="flex flex-wrap items-center gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Link
              href={done}
              className="rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              {toGroup ? "See your schedule" : "Create or join a group"}
            </Link>
            {courses !== null && saved === 0 ? (
              <Link href={next} className="text-sm text-neutral-500 underline-offset-2 hover:underline">
                Skip for now
              </Link>
            ) : saved > 0 ? (
              <span className="text-sm text-neutral-500">
                {saved} section{saved === 1 ? "" : "s"} saved.
              </span>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
