"use client";

import { useMemo, useState } from "react";
import { HeatGrid } from "@/components/HeatGrid";
import type { AttendanceControl, Member } from "@/components/WeekGrid";
import type { AttendanceStatus } from "@/lib/attendance-status";
import type { BusyBlock } from "@/lib/overlap";
import type { DayKey } from "@/lib/sfu";

/**
 * Local fixture for verifying attendance marks and status controls on the
 * availability heatmap. Not linked from the app — open /dev/heat-attendance.
 */
const MEMBERS: Member[] = [
  { id: 1, displayName: "Ada", color: "#ef4444" },
  { id: 2, displayName: "Bo", color: "#3b82f6" },
  { id: 3, displayName: "Cy", color: "#10b981" },
];

const INITIAL: Record<number, BusyBlock[]> = {
  1: [
    {
      day: "Mo",
      start: 540,
      end: 600,
      campus: "Burnaby",
      label: "CMPT 225 D100 LEC",
      course: "CMPT 225",
      detail: "D100 LEC",
      classNumber: "1001",
    },
    {
      day: "Mo",
      start: 600,
      end: 690,
      campus: "Burnaby",
      label: "CMPT 307 D100 LEC",
      course: "CMPT 307",
      detail: "D100 LEC",
      classNumber: "1002",
      status: "skipping",
    },
    {
      day: "Mo",
      start: 690,
      end: 750,
      campus: "Burnaby",
      label: "MACM 201 D100 LEC",
      course: "MACM 201",
      detail: "D100 LEC",
      classNumber: "1003",
    },
    {
      day: "Tu",
      start: 600,
      end: 720,
      campus: "Burnaby",
      label: "CMPT 225 D100 LEC",
      course: "CMPT 225",
      detail: "D100 LEC",
      classNumber: "1001",
      status: "remote",
    },
  ],
  2: [
    {
      day: "Mo",
      start: 540,
      end: 600,
      campus: "Burnaby",
      label: "STAT 270 D100 LEC",
      course: "STAT 270",
      detail: "D100 LEC",
      classNumber: "2001",
    },
    {
      day: "Mo",
      start: 600,
      end: 690,
      campus: "Burnaby",
      label: "CMPT 276 D100 LEC",
      course: "CMPT 276",
      detail: "D100 LEC",
      classNumber: "2002",
    },
    {
      day: "Mo",
      start: 690,
      end: 750,
      campus: "Burnaby",
      label: "MATH 232 D100 LEC",
      course: "MATH 232",
      detail: "D100 LEC",
      classNumber: "2003",
    },
    {
      day: "Tu",
      start: 600,
      end: 720,
      campus: "Burnaby",
      label: "STAT 270 D100 LEC",
      course: "STAT 270",
      detail: "D100 LEC",
      classNumber: "2001",
    },
  ],
  3: [
    {
      day: "Mo",
      start: 540,
      end: 600,
      campus: "Burnaby",
      label: "CMPT 300 D100 LEC",
      course: "CMPT 300",
      detail: "D100 LEC",
      classNumber: "3001",
    },
    {
      day: "Mo",
      start: 690,
      end: 750,
      campus: "Burnaby",
      label: "CMPT 354 D100 LEC",
      course: "CMPT 354",
      detail: "D100 LEC",
      classNumber: "3002",
    },
    {
      day: "Tu",
      start: 540,
      end: 660,
      campus: "Burnaby",
      label: "CMPT 300 D100 LEC",
      course: "CMPT 300",
      detail: "D100 LEC",
      classNumber: "3001",
      status: "remote",
    },
  ],
};

const DAY_LABELS: Record<DayKey, string> = {
  Mo: "Monday, Oct 13",
  Tu: "Tuesday, Oct 14",
  We: "Wednesday, Oct 15",
  Th: "Thursday, Oct 16",
  Fr: "Friday, Oct 17",
  Sa: "Saturday, Oct 18",
  Su: "Sunday, Oct 19",
};

function stamp(
  block: BusyBlock,
  status: AttendanceStatus,
  note: string | null
): BusyBlock {
  if (status === "going" && note === null) {
    const next = { ...block };
    delete next.status;
    delete next.note;
    return next;
  }
  return { ...block, status, note };
}

export default function HeatAttendancePreview() {
  const [busyByMember, setBusyByMember] = useState(INITIAL);
  const [dayStatus, setDayStatus] = useState<
    Partial<Record<DayKey, { status: AttendanceStatus; note: string | null }>>
  >({});
  const [log, setLog] = useState<string[]>([]);

  const attendance: AttendanceControl = useMemo(
    () => ({
      memberId: 1,
      color: MEMBERS[0].color,
      dayStatus,
      dayLabel: (day) => DAY_LABELS[day],
      setBlock: async (block, status, note, opts) => {
        // Fake network latency so the button spinner is visible on Try Live.
        await new Promise((r) => setTimeout(r, 450));
        setBusyByMember((prev) => ({
          ...prev,
          1: (prev[1] ?? []).map((b) =>
            b.classNumber === block.classNumber &&
            b.day === block.day &&
            b.start === block.start
              ? stamp(b, status, note)
              : b
          ),
        }));
        setLog((prev) => [
          `${status} · ${block.course}${opts?.repeat ? " (repeat future weeks)" : ""}`,
          ...prev.slice(0, 4),
        ]);
      },
      setDay: async (day, status, note, opts) => {
        await new Promise((r) => setTimeout(r, 450));
        setDayStatus((prev) => {
          if (status === "going" && note === null) {
            const next = { ...prev };
            delete next[day];
            return next;
          }
          return { ...prev, [day]: { status, note } };
        });
        setLog((prev) => [
          `${status} · all day ${day}${opts?.repeat ? " (repeat future weeks)" : ""}`,
          ...prev.slice(0, 4),
        ]);
      },
    }),
    [dayStatus]
  );

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold tracking-tight">
        Availability + attendance fixture
      </h1>
      <p className="text-sm text-neutral-500">
        You are Ada. Hover Monday 10:00–11:30 (her skipped CMPT 307) or Tuesday
        morning (online) to set Going / Skipping / Online. Check &quot;Also
        apply to future weeks&quot; before pressing — buttons spin while
        saving.
      </p>
      {log.length > 0 && (
        <ul className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {log.map((line, i) => (
            <li key={`${line}-${i}`}>{line}</li>
          ))}
        </ul>
      )}
      <HeatGrid
        members={MEMBERS}
        busyByMember={busyByMember}
        dayStart={8 * 60}
        dayEnd={22 * 60}
        weekStart="2025-10-13"
        attendance={attendance}
      />
    </main>
  );
}
