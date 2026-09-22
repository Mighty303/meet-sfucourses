"use client";

import { useState } from "react";
import { ATTENDANCE_STATUSES, STATUS_EFFECT, type AttendanceStatus } from "@/lib/attendance-status";

interface Props {
  current: AttendanceStatus | null;
  onPick: (status: AttendanceStatus) => void | Promise<void>;
}

const TONE: Record<AttendanceStatus, string> = {
  going: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  skipping: "border-neutral-500 bg-neutral-500/10 text-neutral-700 dark:text-neutral-200",
  remote: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

/** Compact attendance choices for cards that already identify one class. */
export function AttendanceButtons({ current, onPick }: Props) {
  const [pending, setPending] = useState<AttendanceStatus | null>(null);

  async function pick(status: AttendanceStatus) {
    if (pending !== null || status === current) return;
    setPending(status);
    try {
      await onPick(status);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 flex gap-1.5" aria-label="Class attendance">
      {ATTENDANCE_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          disabled={pending !== null}
          onClick={() => pick(status)}
          className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-70 ${
            status === current
              ? TONE[status]
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {pending === status ? "Saving…" : status === "skipping" ? "Skip" : STATUS_EFFECT[status].label}
        </button>
      ))}
    </div>
  );
}
