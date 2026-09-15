"use client";

import { useEffect, useState } from "react";
import { courseCode } from "@/components/CourseChips";
import type { CourseHit, SectionHit } from "@/lib/sfu";

/** "LEC", "TUT", "LAB" — the same for every meeting of a section, so take one. */
function kindOf(s: SectionHit): string {
  return s.meetings.find((m) => m.sectionCode)?.sectionCode ?? "";
}

/**
 * One line per meeting, rather than CourseChips' single joined string.
 *
 * A lecture that meets twice a week at two different lengths — which is most of
 * them at SFU — came out as "Mo 10:30–12:20 · Burnaby | We 10:30–11:20 · Bu…",
 * truncated exactly where the second time would have been. There is room here
 * to put them under each other, so the ellipsis isn't hiding half the answer.
 */
function meetingLines(s: SectionHit): string[] {
  const timed = s.meetings.filter((m) => m.days.trim() !== "");
  if (timed.length === 0) return ["no meeting time"];
  return timed.map(
    (m) => `${m.days} ${m.startTime}–${m.endTime}${m.campus ? ` · ${m.campus}` : ""}`
  );
}

interface Props {
  term: string;
  classNumbers: string[];
  /** Course code -> the colour that course is drawn in on the grid beside this. */
  courseColors?: Record<string, string>;
  /** Sections that clash with another one, from findConflicts. */
  conflicted?: Set<string>;
  onRemove: (classNumber: string) => void;
  /** The section currently being written, so its × can't be pressed twice. */
  busy?: string | null;
}

/**
 * What's saved, one card per course rather than one chip per section.
 *
 * As chips, a course you're in twice — a lecture and its tutorial, which is
 * most of them — read as two unrelated things: "CHIN 100 B100" and "CHIN 100
 * B102" sat side by side repeating the code, and five sections stacked into
 * five near-identical rows with nothing to tell them apart but a four-character
 * suffix. Grouping puts the code once and the sections under it, which is how
 * you think of them, and leaves room on each row for the thing that actually
 * distinguishes them: when it meets.
 *
 * CourseChips still exists and is still right where it's used — the group page
 * wants a colour key it can fit in a 224px column, not this.
 */
export function SavedCourses({ term, classNumbers, courseColors, conflicted, onRemove, busy }: Props) {
  const [saved, setSaved] = useState<CourseHit[] | null>(null);
  const key = classNumbers.join(",");

  useEffect(() => {
    // Nothing to resolve, and nothing rendered either — the guard below returns
    // null for the same case, so there is no state to put anything into.
    if (key === "") return;
    let live = true;
    fetch(`/api/terms/${term}/courses?numbers=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (live && data) setSaved(data.courses); })
      .catch(() => {});
    return () => { live = false; };
  }, [term, key]);

  if (key === "") return null;
  if (saved === null || saved.length === 0) {
    return <p className="text-sm text-neutral-500">Loading your sections…</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {saved.map((c) => {
        const code = courseCode(c);
        const clash = c.sections.some((s) => conflicted?.has(s.classNumber));
        return (
          <li
            key={code}
            className={`rounded-xl border p-3 ${
              clash
                ? "border-red-300 dark:border-red-900"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <div className="flex items-baseline gap-2">
              {courseColors?.[code] && (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-sm"
                  style={{ backgroundColor: courseColors[code] }}
                />
              )}
              <span className="text-sm font-semibold">{code}</span>
              <span className="truncate text-xs text-neutral-500">{c.title}</span>
              {c.units && (
                <span className="ml-auto shrink-0 text-xs text-neutral-400">{c.units}u</span>
              )}
            </div>

            <ul className="mt-2 flex flex-col gap-1">
              {c.sections.map((s) => {
                const kind = kindOf(s);
                return (
                  <li
                    key={s.classNumber}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${
                      conflicted?.has(s.classNumber)
                        ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                        : "bg-neutral-50 dark:bg-neutral-900"
                    }`}
                  >
                    <span className="font-medium">{s.section}</span>
                    {kind && <span className="text-neutral-500">{kind}</span>}
                    <span className="flex min-w-0 flex-col text-neutral-500">
                      {meetingLines(s).map((line) => (
                        <span key={line} className="truncate">{line}</span>
                      ))}
                    </span>
                    {/* Only the × removes — see CourseChips for the accident
                        that rule is there to prevent. */}
                    <button
                      onClick={() => onRemove(s.classNumber)}
                      disabled={busy === s.classNumber}
                      aria-label={`Remove ${code} ${s.section}`}
                      title={`Remove ${code} ${s.section}`}
                      className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md leading-none text-neutral-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
