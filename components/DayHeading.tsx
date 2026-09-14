"use client";

import { CROSS_MS, type HoverCardData, type useHoverCard } from "@/components/HoverCard";
import type { AttendanceControl } from "@/components/WeekGrid";
import type { DayKey } from "@/lib/sfu";

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
 * Shared by both week views, and it's the only status control the heatmap has:
 * that view draws no blocks, so the heading is the only thing on it that
 * belongs to one day.
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
      <div className={`mb-1 flex items-center justify-center gap-1 font-medium ${tone}`}>
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
      onPick: (status, note) => attendance.setDay(day, status, note),
    },
  });

  return (
    <button
      type="button"
      className={`mb-1 flex w-full items-center justify-center gap-1 rounded font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${tone}`}
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
