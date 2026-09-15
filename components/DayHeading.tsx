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
  // Today is the whole pill rather than a dot beside the name. On a phone only
  // one day is on screen, so the header is the only thing saying which day it
  // is — and which one is today.
  const tone = isToday
    ? "border-emerald-500/60 bg-emerald-400/25 text-emerald-900 dark:text-emerald-100"
    : "border-neutral-200 bg-neutral-100/70 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300";
  const hoverTone = isToday
    ? "hover:border-emerald-500 hover:bg-emerald-400/40"
    : "hover:border-neutral-300 hover:bg-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-800";
  const mine = attendance?.dayStatus[day];

  // Outlined on today, where a bare emerald dot would sink into the green fill.
  const mark = mine && (
    <span
      className={`h-1.5 w-1.5 rounded-full ${isToday ? "outline outline-1 outline-white/70 dark:outline-black/40" : ""} ${
        mine.status === "remote"
          ? "bg-blue-500"
          : mine.status === "skipping"
            ? "ring-1 ring-neutral-400"
            : "bg-emerald-600 dark:bg-emerald-400"
      }`}
    />
  );

  const inner = (
    <>
      {LABELS[day]}
      {mark}
    </>
  );

  if (!attendance) {
    return (
      <div className={`${DAY_HEADING_BOX} border ${tone}`}>
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
      className={`${DAY_HEADING_BOX} w-full cursor-pointer border transition-colors ${tone} ${hoverTone}`}
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
