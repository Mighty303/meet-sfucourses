"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoursePicker } from "@/components/CoursePicker";
import { WeekPreview, type PreviewState } from "@/components/WeekPreview";
import { findConflicts } from "@/lib/conflicts";
import { courseColors } from "@/lib/course-color";
import { readGuestCourses } from "@/lib/guest-schedule";
import { attending, blocksFromSection } from "@/lib/overlap";
import { currentTermCode, fromTermCode, type SectionHit } from "@/lib/sfu";

/**
 * Your actual week, on the landing page, before you have an account.
 *
 * What sat here was a demonstration: four invented people on invented courses,
 * which answers "what is this" and nothing else. The first real question — is
 * my Wednesday as bad as I think — needed an account, a saved schedule and two
 * pages of navigation to reach. Now it needs typing one course code.
 *
 * Nothing is written to the database. The sections live in localStorage (see
 * lib/guest-schedule.ts) and the week is drawn by /api/schedule/preview, which
 * is public because a timetable assembled from published course data is public
 * information. Signing up later copies the list onto the account — see
 * components/ClaimGuestCourses.tsx — so none of this is typed twice.
 *
 * Empty, it is an empty week — five columns waiting, not a demonstration of
 * four people who don't exist. The invented group was a better picture and a
 * worse promise: it showed a full grid nobody could act on, and every visitor
 * had to work out that none of it was theirs. Blank columns that fill in as
 * you type say the same thing about what this is, and mean it.
 */

// The term the landing page is about. No switcher: someone deciding whether to
// use this is deciding about the term they are in, and last spring is a
// question for /courses.
const TERM = currentTermCode();

export function GuestSchedule() {
  // Null until localStorage has been read, which can't happen during render —
  // it is impure, and the server has no localStorage to agree with anyway.
  const [classNumbers, setClassNumbers] = useState<string[] | null>(null);
  const [schedule, setSchedule] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The search result under the cursor, sketched onto the grid before it's
  // added. Null the rest of the time, which is most of the time.
  const [preview, setPreview] = useState<{ course: string; section: SectionHit } | null>(null);

  /** Re-read the browser's list and redraw the week it comes to. */
  const load = useCallback(async () => {
    const saved = readGuestCourses(TERM);
    setClassNumbers(saved);
    if (saved.length === 0) {
      setSchedule(null);
      setError(null);
      return;
    }
    const res = await fetch(
      `/api/schedule/preview?term=${TERM}&numbers=${saved.join(",")}`
    ).catch(() => null);
    if (!res?.ok) {
      setSchedule(null);
      setError(
        res?.status === 502
          ? `SFU hasn't published the ${fromTermCode(TERM)} timetable yet, so there's no week to draw.`
          : "Could not draw your week."
      );
      return;
    }
    setError(null);
    setSchedule(await res.json());
  }, []);

  // The state updates happen after an await, not synchronously, so the
  // cascading-render concern behind this rule doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const previewBlocks = useMemo(
    () => (preview ? blocksFromSection(preview.course, preview.section) : []),
    [preview]
  );

  const colors = useMemo(() => {
    if (!schedule) return undefined;
    return courseColors([
      ...schedule.busy.filter((b) => b.classNumber !== undefined).map((b) => b.course),
      ...schedule.unscheduled.map((s) => s.course),
    ]);
  }, [schedule]);

  const conflicts = useMemo(
    () => (schedule ? findConflicts(attending(schedule.busy)) : []),
    [schedule]
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
        {/* Not a heading: the picker brings its own, and three of them stacked
            said the same thing three times. This is the one fact it can't
            say — that none of this is going to ask you to sign up. */}
        <p className="text-sm text-neutral-500">
          {fromTermCode(TERM)} · no account needed
        </p>
        <CoursePicker
          term={TERM}
          target={{ via: "guest" }}
          classNumbers={classNumbers ?? []}
          loading={classNumbers === null}
          courseColors={colors}
          onChange={load}
          onPreview={setPreview}
        />
      </div>

      <WeekPreview
        term={TERM}
        state={schedule}
        loading={classNumbers === null}
        error={error}
        courseColors={colors}
        conflicts={conflicts}
        preview={previewBlocks}
        drawWhenEmpty
      />
    </div>
  );
}
