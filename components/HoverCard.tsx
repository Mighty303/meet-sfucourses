"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENDANCE_STATUSES,
  STATUS_EFFECT,
  type AttendanceStatus,
} from "@/lib/attendance-status";

/**
 * A row on the card. A plain string is a sentence and reads as one; the
 * `{ label, value }` form is the "In class: Ann, Bo" shape, where the label is
 * a category you skim past and the value is the thing you came to read. Split
 * so the two can be weighted differently — flat grey rows of equal emphasis
 * meant finding one name in a six-line card was a linear scan.
 */
export type HoverLine = string | { label: string; value: string };

/**
 * The status control, when the thing under the cursor is the viewer's own.
 *
 * Its presence is what makes a card interactive: a card with buttons stops
 * following the cursor, accepts the pointer, and lingers when you leave the
 * thing that opened it. A card without one behaves exactly as it always has.
 */
export interface HoverStatus {
  current: AttendanceStatus;
  note: string | null;
  /**
   * May return a promise — the buttons spin until it settles, so a slow save
   * doesn't look like the press was ignored.
   */
  onPick: (
    status: AttendanceStatus,
    note: string | null,
    opts?: { repeat?: boolean }
  ) => void | Promise<void>;
  /**
   * Offer a Google-Calendar-style "also apply to future weeks" checkbox. Off
   * for one-off fixtures that have no series to write into.
   */
  allowRepeat?: boolean;
}

export interface HoverCardData {
  title: string;
  subtitle?: string;
  lines: HoverLine[];
  accent: string;
  /** Cursor position, in viewport coordinates. */
  x: number;
  y: number;
  status?: HoverStatus;
}

/** Long enough to cross the gap between a block and its card without hurrying. */
export const CROSS_MS = 220;

/**
 * The open card, and the several ways it closes that a mouse doesn't need.
 *
 * A tap fires the emulated mouseenter that opens the card, but a finger never
 * leaves, so `onMouseLeave` never comes and the card would sit there over a
 * band it has stopped describing. The next touch anywhere dismisses it — which
 * on a desktop means a click also dismisses, and that's fine, since the mouse
 * still has `onMouseLeave` for the ordinary case.
 *
 * Scrolling dismisses it too, and that one matters more than it looks: the card
 * is `fixed`, so swiping the day track sideways would leave it hanging over a
 * different day entirely. Captured, because the scroll that moves under it is
 * the track's, not the page's.
 *
 * The exception to all of it is the card's own contents. Once a card carries
 * status buttons, the pointerdown that presses one lands *inside* the card, and
 * dismissing on it would eat the press — so anything within the card is not a
 * dismissal, and leaving the block it describes only starts a timer that moving
 * onto the card cancels.
 */
export function useHoverCard() {
  const [card, setCard] = useState<HoverCardData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopClosing = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback((next: HoverCardData) => {
    stopClosing();
    setCard(next);
  }, [stopClosing]);

  const move = useCallback((x: number, y: number) => {
    // Pinned once it has buttons. A card you have to reach can't be one that
    // slides further away with every pixel you move toward it.
    setCard((cur) => (cur && !cur.status ? { ...cur, x, y } : cur));
  }, []);

  const hide = useCallback((delay = 0) => {
    stopClosing();
    if (delay === 0) {
      setCard(null);
      return;
    }
    timer.current = setTimeout(() => {
      // Mid-note: the pointer wandering off isn't a decision to throw away what
      // they were in the middle of writing. A press outside still dismisses.
      if (cardRef.current?.contains(document.activeElement)) return;
      setCard(null);
    }, delay);
  }, [stopClosing]);

  useEffect(() => {
    if (!card) return;
    const dismiss = (e: Event) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      stopClosing();
      setCard(null);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [card, stopClosing]);

  useEffect(() => stopClosing, [stopClosing]);

  return { card, cardRef, show, move, hide, stopClosing };
}

/**
 * What each status says to the rest of the group, in their words rather than
 * the column's. "Skipping" is the one that changes the grid, so it says so —
 * nobody marks a class skipped for the group's benefit unless they can see that
 * it does something.
 */
const BLURB: Record<AttendanceStatus, string> = {
  going: "On campus as timetabled",
  skipping: "Frees this hour for the group",
  remote: "Busy, but not on campus",
};

const TONE: Record<AttendanceStatus, string> = {
  going: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  skipping: "border-neutral-500 bg-neutral-500/10 text-neutral-700 dark:text-neutral-200",
  remote: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Three buttons, an optional "repeat for future weeks" checkbox, and a note —
 * under whatever the card was already saying. Kept in the card rather than in a
 * panel of its own because the two answer the same question one after the
 * other: what is this class, and am I going to it.
 *
 * The checkbox is the Google Calendar move: one decision, applied to this
 * meeting and every later one in the series, without a second dialog.
 */
function StatusRow({ status }: { status: HoverStatus }) {
  const [note, setNote] = useState(status.note ?? "");
  const [repeat, setRepeat] = useState(false);
  const [pending, setPending] = useState<AttendanceStatus | null>(null);

  async function pick(next: AttendanceStatus) {
    if (pending) return;
    setPending(next);
    try {
      await status.onPick(next, note.trim().slice(0, 80) || null, {
        repeat: status.allowRepeat ? repeat : false,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-2.5 border-t border-neutral-200 pt-2.5 dark:border-neutral-700">
      <div className="flex gap-1.5">
        {ATTENDANCE_STATUSES.map((s) => {
          const busy = pending === s;
          return (
            <button
              key={s}
              type="button"
              title={BLURB[s]}
              disabled={pending !== null}
              onClick={() => pick(s)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-70 ${
                s === status.current
                  ? TONE[s]
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {busy ? <Spinner /> : null}
              {STATUS_EFFECT[s].label}
            </button>
          );
        })}
      </div>
      {/* The selected one explains itself, so the three buttons don't each need
          a line of their own and the card stays the size of a tooltip. */}
      <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
        {BLURB[status.current]}
      </p>
      {status.allowRepeat && (
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={repeat}
            disabled={pending !== null}
            onChange={(e) => setRepeat(e.target.checked)}
            className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-900"
          />
          <span>
            Also apply to future weeks
            <span className="block text-neutral-400 dark:text-neutral-500">
              Same weekday for the rest of the term
            </span>
          </span>
        </label>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={80}
        disabled={pending !== null}
        placeholder="Add a note (optional)"
        // Saved with whichever status is pressed next, not on a button of its
        // own — a note with no status is nothing.
        className="mt-1.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </div>
  );
}

/**
 * Follows the cursor, fixed rather than in flow: the day columns clip their
 * overflow, so an in-flow tooltip would be cut off at the column edge. Shared
 * by both week views so a block and a heatmap cell read identically.
 */
export function HoverCard({
  card,
  cardRef,
  onEnter,
  onLeave,
}: {
  card: HoverCardData;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const live = card.status !== undefined;
  return (
    <div
      ref={cardRef}
      // Offset from the cursor, and pulled back near the right and bottom edges
      // so it stays on screen. A card with buttons is taller, and one that runs
      // off the bottom is one whose buttons can't be pressed.
      // Wider and roomier once it has controls in it: three buttons and a text
      // field at tooltip size are a thing you aim at, not a thing you read.
      // A plain card is still only ever read, so it keeps its old dimensions.
      className={`fixed z-50 w-max rounded-lg border border-neutral-200 bg-white/95 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 ${
        live
          ? "min-w-[280px] max-w-[340px] px-4 py-3"
          : "pointer-events-none max-w-[280px] px-3 py-2"
      }`}
      style={{
        left: Math.min(card.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300),
        top: live
          ? Math.min(card.y + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 340)
          : card.y + 14,
      }}
      onMouseEnter={live ? onEnter : undefined}
      onMouseLeave={live ? onLeave : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: card.accent }} />
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {card.title}
        </span>
        {card.subtitle && <span className="text-xs text-neutral-500">{card.subtitle}</span>}
      </div>
      {card.lines.map((line, i) =>
        typeof line === "string" ? (
          <div key={i} className="mt-0.5 text-xs leading-snug text-neutral-700 dark:text-neutral-300">
            {line}
          </div>
        ) : (
          <div key={i} className="mt-0.5 text-xs leading-snug">
            <span className="text-neutral-500 dark:text-neutral-400">{line.label}: </span>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{line.value}</span>
          </div>
        )
      )}
      {card.status && (
        // Remounted per target, so the note box never carries one class's note
        // across to the next.
        <StatusRow key={`${card.title}|${card.subtitle ?? ""}`} status={card.status} />
      )}
    </div>
  );
}
