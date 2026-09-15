"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CoursePicker } from "@/components/CoursePicker";
import { fromTermCode, termOptions } from "@/lib/sfu";

/**
 * The body of /courses: a term, a search box, and the way out.
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
  next,
}: {
  startTerm: string;
  /** Resolved on the server for `startTerm`, so the first paint is the real list. */
  startCourses: string[];
  /** Where Continue and Skip both go. Already through safeNext. */
  next: string;
}) {
  const [term, setTerm] = useState(startTerm);
  // Null while a term's list is in flight, which is a different thing from an
  // empty one — the difference between "nothing saved" and "not yet known",
  // and the picker says so.
  const [courses, setCourses] = useState<string[] | null>(startCourses);
  // The term the newest request was for. Two switches in quick succession can
  // come back out of order, and the older answer must not overwrite the newer.
  const wanted = useRef(startTerm);

  /**
   * Re-read for one term, after an edit or a switch.
   *
   * The picker's own POST already returns the new list, but reading it back is
   * what makes the two the same code path — and this is one query against a
   * primary key, not the group page's whole state. Takes the term rather than
   * closing over it, so the switch can fetch the new one without waiting a
   * render for the state to catch up.
   */
  const load = useCallback(async (forTerm: string) => {
    wanted.current = forTerm;
    const res = await fetch(`/api/me/courses?term=${forTerm}`);
    if (!res.ok || wanted.current !== forTerm) return;
    const data = await res.json();
    setCourses(data.classNumbers);
  }, []);

  function switchTerm(next: string) {
    setTerm(next);
    setCourses(null);
    load(next);
  }

  // A group to go back to gets said out loud. Anything else is the home page,
  // where the next thing to do is start or join one — so the button says that
  // rather than "Continue", which would be a button pointing at nothing.
  const toGroup = next.startsWith("/g/");
  const saved = courses?.length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 pb-20 sm:pb-24">
      <div className="fade-up flex flex-wrap items-start justify-between gap-3">
        <div>
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

      <div className="fade-up" style={{ animationDelay: "120ms" }}>
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
          onChange={() => load(term)}
        />
      </div>

      {/* Skip is a link, not a lesser button: this step is a suggestion about
          what to do first, and dressing the way past it as a control to defeat
          would make it look like one. */}
      <div
        className="fade-up flex flex-wrap items-center gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800"
        style={{ animationDelay: "240ms" }}
      >
        <Link
          href={next}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          {toGroup ? "Continue to the group" : "Create or join a group"}
        </Link>
        {courses !== null && saved === 0 ? (
          <Link href={next} className="text-sm text-neutral-500 underline-offset-2 hover:underline">
            Skip for now
          </Link>
        ) : saved > 0 ? (
          <span className="text-sm text-neutral-500">
            {saved} section{saved === 1 ? "" : "s"} saved. You can change these any time.
          </span>
        ) : null}
      </div>
    </main>
  );
}
