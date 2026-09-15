"use client";

import { CROSS_MS, type HoverCardData, type useHoverCard } from "@/components/HoverCard";
import type { AttendanceControl } from "@/components/WeekGrid";
import type { DayKey } from "@/lib/sfu";

/**
 * The heading's own box, shared with the time gutter's blank spacer so the two
 * columns keep the same first row. The heading is a hit target now, not a
 * caption, so its height is set here rather than left to the text.
 */
export const DAY_HEADING_BOX = "mb-1 flex h-8 items-center justify-center gap-1 rounded-md font-medium";

const LABELS: Record<DayKey, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun",
};

/**
 * The day's name, and — when the viewer is in the group — the handle for saying
 * something about the whole of it at once.
 *
 * Per-class is the precision; per-day is the habit. "I'm not coming in
 * Thursday" is one hover here instead of four over the blocks below, and every
 * class that day inherits it unless it has an answer of its own.
 *
 * Shared by both week views. On the heatmap it's also the whole-day handle —
 * per-class status lives on the bands themselves when one of yours is in the
 * way (or when a skip of yours opened the window).
 */
export function DayHeading({
  day,
  isToday,
  attendance,
  hover,
}: {
  day: DayKey;
  isToday: boolean;
  attendance?: AttendanceControl;
  hover: ReturnType<typeof useHoverCard>;
}) {
  const tone =
    isToday ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-300";
  const mine = attendance?.dayStatus[day];

  const mark = mine && (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        mine.status === "remote"
          ? "bg-blue-500"
          : mine.status === "skipping"
            ? "ring-1 ring-neutral-400"
            : "bg-emerald-500"
      }`}
    />
  );

  const inner = (
    <>
      {LABELS[day]}
      {/* On a phone only one day is on screen, so the header is the
          only thing saying which. */}
      {isToday && <span className="text-red-500">•</span>}
      {mark}
    </>
  );

  if (!attendance) {
    return (
      <div className={`${DAY_HEADING_BOX} ${tone}`}>
        {inner}
      </div>
    );
  }

  const card = (x: number, y: number): HoverCardData => ({
    title: attendance.dayLabel(day),
    lines: ["Every class this day"],
    accent: attendance.color,
    x,
    y,
    status: {
      current: mine?.status ?? "going",
      note: mine?.note ?? null,
      onPick: (status, note, opts) => attendance.setDay(day, status, note, opts),
      allowRepeat: true,
    },
  });

  return (
    <button
      type="button"
      // A resting fill and a full-height box: the whole-day handle is worth
      // aiming at, and a caption-sized strip of text was easy to miss between
      // the columns.
      className={`${DAY_HEADING_BOX} w-full cursor-pointer border border-neutral-200 bg-neutral-100/70 transition-colors hover:border-neutral-300 hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 ${tone}`}
      onMouseEnter={(e) => hover.show(card(e.clientX, e.clientY))}
      onMouseLeave={() => hover.hide(CROSS_MS)}
      // Touch has no hover, and focus has no cursor — both need somewhere to
      // put the card, so both anchor it to the heading itself.
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        hover.show(card(r.left, r.bottom));
      }}
      onFocus={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        hover.show(card(r.left, r.bottom));
      }}
      onBlur={() => hover.hide(CROSS_MS)}
    >
      {inner}
    </button>
  );
}
