"use client";

import { useEffect, useState } from "react";
import type { CourseHit, SectionHit } from "@/lib/sfu";

/** "CMPT 225" — the form every label and colour key in the app is written in. */
export function courseCode(c: CourseHit): string {
  return `${c.dept} ${c.number}`;
}

/** "Mo, We 10:30–11:20 · Burnaby", or "no meeting time" for async sections. */
export function meetingLabel(s: SectionHit): string {
  const timed = s.meetings.filter((m) => m.days.trim() !== "");
  if (timed.length === 0) return "no meeting time";
  return timed
    .map((m) => `${m.days} ${m.startTime}–${m.endTime}${m.campus ? ` · ${m.campus}` : ""}`)
    .join("  |  ");
}

interface Props {
  /** The term to resolve these class numbers against. */
  term: string;
  classNumbers: string[];
  /**
   * Course code -> the colour that course is drawn in on the grid. Whatever
   * that is — one per course on your own week, your single member colour in a
   * group — the chip carries the same swatch, which is what makes this list
   * the key to the grid rather than just a list.
   */
  courseColors?: Record<string, string>;
  /**
   * Omitted where the list is a legend rather than an editor, which is how the
   * group page reads it now that editing lives at /courses. No handler, no ×.
   */
  onRemove?: (classNumber: string) => void;
  /** The section currently being written, so its × can't be pressed twice. */
  busy?: string | null;
  /**
   * Sized for the member column, which is 224px wide — chips at body size wrap
   * one per line there and turn a five-course schedule into five rows.
   */
  compact?: boolean;
}

/**
 * What's saved, as chips that say "CMPT 225 D100" rather than a class number.
 *
 * Split out of CoursePicker because two pages want the list and only one of
 * them wants the search box above it: the group page shows this as the legend
 * for the colours on its grid, and sends you to /courses to change anything.
 * The resolution round trip lives here so neither caller has to know that a
 * saved schedule is stored as bare numbers.
 */
export function CourseChips({ term, classNumbers, courseColors, onRemove, busy, compact = false }: Props) {
  const [saved, setSaved] = useState<CourseHit[]>([]);
  const key = classNumbers.join(",");

  useEffect(() => {
    if (key === "") return;
    let live = true;
    fetch(`/api/terms/${term}/courses?numbers=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (live && data) setSaved(data.courses); })
      .catch(() => {});
    return () => { live = false; };
  }, [term, key]);

  if (key === "") return null;
  if (saved.length === 0) {
    return (
      <p className={`text-neutral-500 ${compact ? "text-xs" : "text-sm"}`}>
        Loading your sections…
      </p>
    );
  }

  return (
    <ul className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      {saved.map((c) =>
        c.sections.map((s) => (
          <li key={s.classNumber}>
            {/* The chip is a label, not a button. The whole thing used to be
                the remove control, so reaching for a course to read its
                meeting times dropped it from every group you're in — an
                undo-less delete on the most obvious thing to click. Only the
                × removes, and only where there is one. */}
            <span
              title={`${courseCode(c)} ${s.section}: ${meetingLabel(s)}`}
              className={`flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 ${
                compact ? "gap-1.5 py-1 text-xs" : "gap-2 py-1.5 text-sm"
              } ${
                onRemove
                  ? compact ? "pl-2 pr-1" : "pl-2.5 pr-1.5"
                  : compact ? "px-2" : "px-2.5"
              }`}
            >
              {courseColors?.[courseCode(c)] && (
                <span
                  aria-hidden
                  className={`shrink-0 rounded-sm ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`}
                  style={{ backgroundColor: courseColors[courseCode(c)] }}
                />
              )}
              <span className="font-medium">{courseCode(c)}</span>
              <span className="text-neutral-500">{s.section}</span>
              {onRemove && (
                <button
                  onClick={() => onRemove(s.classNumber)}
                  disabled={busy === s.classNumber}
                  aria-label={`Remove ${courseCode(c)} ${s.section}`}
                  title={`Remove ${courseCode(c)} ${s.section}`}
                  className="flex h-5 w-5 items-center justify-center rounded-md leading-none text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <span aria-hidden>×</span>
                </button>
              )}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
