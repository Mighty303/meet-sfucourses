"use client";

import { useEffect, useRef, useState } from "react";
import { CourseChips, courseCode, meetingLabel } from "@/components/CourseChips";
import { addCourse, removeCourse, type CourseTarget } from "@/lib/course-writes";
import type { CourseHit, SectionHit } from "@/lib/sfu";

export type { CourseTarget };

interface Props {
  /** The term this schedule is for, e.g. "2026-fall" — searches are scoped to it. */
  term: string;
  target: CourseTarget;
  /** Class numbers already saved, so the picker can mark and unmark them. */
  classNumbers: string[];
  /**
   * The saved list is still being fetched, so an empty one means "not yet"
   * rather than "none". Only /courses needs this — everywhere else the list
   * arrives with the page.
   */
  loading?: boolean;
  /** Passed through to the chips — see CourseChips for what the swatch means. */
  courseColors?: Record<string, string>;
  /**
   * Whether the saved list is drawn above the search box.
   *
   * /courses shows what's saved as course cards next to a week grid, where the
   * colours and the clashes are — so the chip row there would be the same list
   * twice under two different headings, both called "Your courses". Everywhere
   * else the picker is the only thing on screen that knows what's saved, and
   * has to say so itself.
   */
  showSaved?: boolean;
  /** Called after every add or remove so the page can refresh the grid. */
  onChange: () => void;
  /**
   * Fired with the section under the cursor, and null on the way out, so the
   * page can sketch it onto the grid before it's saved. Omitted where there is
   * no grid to sketch on.
   */
  onPreview?: (hit: { course: string; section: SectionHit } | null) => void;
}

/** Sized to the button's text so swapping one for the other moves nothing. */
function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CoursePicker({ term, target, classNumbers, loading = false, courseColors, showSaved = true, onChange, onPreview }: Props) {
  const [query, setQuery] = useState("");
  // Tagged with the query they answer, so a result set never outlives its box.
  const [hits, setHits] = useState<{ q: string; courses: CourseHit[] }>({ q: "", courses: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Clearing puts the cursor back in the box: the button is a shortcut to
  // typing a new query, not a way out of the search.
  const inputRef = useRef<HTMLInputElement>(null);

  const savedSet = new Set(classNumbers);

  // Debounced: people type "cmpt 225" a character at a time.
  const q = query.trim();
  const searchable = q.length >= 2;

  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/terms/${term}/courses?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (live) setHits({ q, courses: data?.courses ?? [] }); })
        .catch(() => { if (live) setHits({ q, courses: [] }); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [term, q, searchable]);

  async function add(classNumber: string) {
    setBusy(classNumber);
    const failure = await addCourse(target, term, classNumber);
    setBusy(null);
    setError(failure);
    if (!failure) onChange();
  }

  async function remove(classNumber: string) {
    setBusy(classNumber);
    const failure = await removeCourse(target, term, classNumber);
    setBusy(null);
    setError(failure);
    if (!failure) onChange();
  }

  const searching = hits.q !== q;
  const shownResults = searching ? [] : hits.courses;

  /**
   * The section Enter would add: the only one on screen, and not already in.
   *
   * "Exactly one" is counted across sections, not courses — a search that
   * turns up one course with a lecture and two tutorials is three answers, and
   * picking one of them for you would be a guess. Null the rest of the time,
   * which is also what hides the hint under the box.
   */
  const flat = shownResults.flatMap((c) =>
    c.sections.map((s) => ({ course: courseCode(c), section: s }))
  );
  const only = flat.length === 1 && !savedSet.has(flat[0].section.classNumber) ? flat[0] : null;

  /**
   * Enter adds the one section on screen.
   *
   * People type a code they already know and hit Enter in the same breath,
   * well inside the 250ms debounce, so the keystroke usually lands before any
   * results do. Rather than drop it — which would make the shortcut feel
   * broken at exactly the speed it's meant for — Enter runs the search itself
   * and skips whatever is left of the debounce. Should the debounced fetch
   * land too it carries the same answer for the same query.
   *
   * Enter never removes. Taking a section out on a keystroke is not a thing to
   * do by accident, so an already-added match is left alone.
   */
  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !searchable) return;
    e.preventDefault();
    if (only) { add(only.section.classNumber); return; }
    // Results are in and they're ambiguous, or empty. Nothing Enter can mean.
    if (!searching) return;

    const pending = q;
    const res = await fetch(`/api/terms/${term}/courses?q=${encodeURIComponent(pending)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const courses: CourseHit[] = res?.courses ?? [];
    setHits({ q: pending, courses });

    const matches = courses.flatMap((c) => c.sections);
    if (matches.length === 1 && !savedSet.has(matches[0].classNumber)) {
      add(matches[0].classNumber);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {showSaved && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Your courses</h3>
          {classNumbers.length === 0 && (
            <p className="text-sm text-neutral-500">
              {loading ? "Loading your sections…" : "Nothing saved yet. Add your sections below."}
            </p>
          )}
          <CourseChips
            term={term}
            classNumbers={classNumbers}
            courseColors={courseColors}
            onRemove={remove}
            busy={busy}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Search SFU courses</h3>
        {/* Typing searches. Enter adds, but only when the results leave no room
            for doubt — a query like "cmpt 225" matches a lecture and its
            tutorials, and there is no way to tell which of them you're in. */}
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.2 13.2L17 17" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="CMPT 225, MATH 151, calculus…"
            // Right padding is there whether or not the button is, so the text
            // doesn't shift under the cursor on the first and last keystroke.
            className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-9 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
      </div>

      {/* Only when there is one answer, so the line is never a promise the
          keystroke won't keep. */}
      {only && (
        <p className="text-xs text-neutral-500">
          Press <kbd className="rounded border border-neutral-300 px-1 font-sans text-[10px] dark:border-neutral-700">Enter</kbd>{" "}
          to add <span className="font-medium text-neutral-700 dark:text-neutral-300">{only.course} {only.section.section}</span>
        </p>
      )}

      {searchable && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          {shownResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">
              {searching ? "Searching…" : "Nothing matches that this term."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {shownResults.map((c) => (
                <li key={`${c.dept}${c.number}`} className="px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{courseCode(c)}</span>
                    <span className="truncate text-xs text-neutral-500">{c.title}</span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {c.sections.map((s) => {
                      const on = savedSet.has(s.classNumber);
                      return (
                        <li
                          key={s.classNumber}
                          // On the row, not just the button: the times are what
                          // you're reading when you want to see where it lands.
                          onMouseEnter={() => onPreview?.({ course: courseCode(c), section: s })}
                          onMouseLeave={() => onPreview?.(null)}
                          onFocus={() => onPreview?.({ course: courseCode(c), section: s })}
                          onBlur={() => onPreview?.(null)}
                          className="flex flex-wrap items-center gap-2 text-xs"
                        >
                          <button
                            onClick={() => { onPreview?.(null); return on ? remove(s.classNumber) : add(s.classNumber); }}
                            disabled={busy === s.classNumber}
                            className={`flex w-16 shrink-0 items-center justify-center rounded-lg border px-2 py-1 font-medium transition-colors disabled:opacity-50 ${
                              on
                                ? "border-neutral-300 text-neutral-500 hover:border-red-400 hover:text-red-600 dark:border-neutral-700"
                                : "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                            }`}
                          >
                            {/* The round trip writes to the term schedule and
                                then reloads the whole group, so it is long
                                enough to look like a click that missed. The
                                button keeps its width, so nothing reflows. */}
                            {busy === s.classNumber ? (
                              <Spinner />
                            ) : on ? (
                              "Added"
                            ) : (
                              "Add"
                            )}
                          </button>
                          <span className="font-medium">{s.section}</span>
                          <span className="text-neutral-500">{meetingLabel(s)}</span>
                          {s.instructor && (
                            <span className="truncate text-neutral-500">{s.instructor}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-amber-600">{error}</p>}
      </div>
    </div>
  );
}
