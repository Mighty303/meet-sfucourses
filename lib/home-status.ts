import type { AttendanceStatus } from "./attendance-status";

export interface PresenceBlock {
  start: number;
  end: number;
  campus: string;
  status?: AttendanceStatus;
}

/**
 * Whether a person's attended in-person classes place them on campus at a
 * moment today. Presence covers the span between their first and last campus
 * class, which includes the gaps where a meetup can happen.
 */
export function campusPresence(
  blocks: PresenceBlock[],
  minutes: number
): { campus: string | null; nextChange: number | null } {
  const attended = blocks.filter(
    (block) => block.status !== "skipping" && block.status !== "remote" && block.campus
  );
  if (attended.length === 0) return { campus: null, nextChange: null };

  const first = Math.min(...attended.map((block) => block.start));
  const last = Math.max(...attended.map((block) => block.end));
  if (minutes < first) return { campus: null, nextChange: first };
  if (minutes >= last) return { campus: null, nextChange: null };

  let nearest = attended[0];
  let nearestGap = Number.POSITIVE_INFINITY;
  for (const block of attended) {
    const gap =
      block.end <= minutes
        ? minutes - block.end
        : block.start > minutes
          ? block.start - minutes + 0.5
          : 0;
    if (gap < nearestGap) {
      nearest = block;
      nearestGap = gap;
    }
  }
  return { campus: nearest.campus, nextChange: last };
}
