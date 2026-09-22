"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AttendanceButtons } from "@/components/AttendanceButtons";
import { campusNow } from "@/lib/class-status";
import { formatTime } from "@/lib/sfu";
import type { AttendanceStatus } from "@/lib/attendance-status";

export interface PersonStatus {
  key: string;
  displayName: string;
  image: string | null;
  color: string;
  isCurrentUser: boolean;
  status: AttendanceStatus | "away";
  classLabel: string | null;
  campus: string | null;
}

export interface ClassOccurrence {
  course: string;
  title: string;
  section: string;
  classNumber: string;
  campus: string;
  date: string;
  start: number;
  end: number;
  status: "going" | "skipping" | "remote";
  note: string | null;
}

export interface HomeStatus {
  onCampus: PersonStatus[];
  currentClasses: ClassOccurrence[];
  nextClass: ClassOccurrence | null;
  hasScheduledClasses: boolean;
  refreshAt: string;
}

function dayLabel(date: string): string {
  const today = campusNow(new Date()).date;
  if (date === today) return "Today";
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function Person({ person }: { person: PersonStatus }) {
  const statusLabel = person.status === "remote"
    ? "Online"
    : person.status === "skipping"
      ? "Skipping"
      : person.status === "away"
        ? "Away"
        : "Going";
  const statusTone = person.status === "remote"
    ? "text-blue-700 dark:text-blue-300"
    : person.status === "skipping"
      ? "text-neutral-600 dark:text-neutral-300"
      : person.status === "away"
        ? "text-neutral-500 dark:text-neutral-400"
        : "text-emerald-700 dark:text-emerald-300";

  return (
    <span className="flex min-w-0 items-start gap-2">
      {person.image ? (
        <Image src={person.image} alt="" width={28} height={28} className="shrink-0 rounded-full" />
      ) : (
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: person.color }} />
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate" style={{ color: person.color }}>
            {person.isCurrentUser ? "You" : person.displayName}
          </span>
          <span className={`shrink-0 text-xs font-medium ${statusTone}`}>{statusLabel}</span>
        </span>
        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
          {person.classLabel ?? "No class right now"}
          {person.campus ? ` · ${person.campus}` : ""}
        </span>
      </span>
    </span>
  );
}

function secondsUntil(occurrence: ClassOccurrence, now: Date): number | null {
  const current = campusNow(now);
  if (occurrence.date < current.date) return null;
  if (occurrence.date === current.date) {
    return occurrence.start * 60 - (current.minutes * 60 + current.seconds);
  }
  const currentDate = new Date(`${current.date}T12:00:00Z`);
  const targetDate = new Date(`${occurrence.date}T12:00:00Z`);
  const days = Math.round((targetDate.getTime() - currentDate.getTime()) / 86_400_000);
  return days * 86_400 + occurrence.start * 60 - (current.minutes * 60 + current.seconds);
}

function countdownLabel(seconds: number): string {
  if (seconds < 60) return "in less than a minute";
  const minutes = Math.floor(seconds / 60);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainder = minutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${remainder}m`;
  return `in ${remainder}m`;
}

function ClassLine({
  occurrence,
  label,
  now,
  onStatusChange,
}: {
  occurrence: ClassOccurrence;
  label: string;
  now: Date;
  onStatusChange: (occurrence: ClassOccurrence, status: AttendanceStatus) => void | Promise<void>;
}) {
  const countdown = label === "Next class" ? secondsUntil(occurrence, now) : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{label}</p>
        {countdown !== null && countdown >= 0 && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{countdownLabel(countdown)}</p>}
      </div>
      <p className="text-lg font-semibold tracking-tight">
        {occurrence.course} <span className="font-normal text-neutral-500 dark:text-neutral-400">{occurrence.section}</span>
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{occurrence.title}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {dayLabel(occurrence.date)} · {formatTime(occurrence.start)}–{formatTime(occurrence.end)} · {occurrence.status === "remote" ? "Online" : occurrence.campus || "Campus"}
      </p>
      <AttendanceButtons
        current={occurrence.status}
        onPick={(status) => onStatusChange(occurrence, status)}
      />
    </div>
  );
}

/** The signed-in homepage's live campus and class snapshot. */
export function ClassStatusCard({ preview }: { preview?: HomeStatus } = {}) {
  const [status, setStatus] = useState<HomeStatus | null>(preview ?? null);
  const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    if (preview) return;
    let live = true;
    let timer: number | undefined;
    const refresh = () => {
      fetch("/api/me/next-class")
        .then((res) => { if (!res.ok) throw new Error("Could not load home status"); return res.json() as Promise<HomeStatus>; })
        .then((data) => {
          if (!live) return;
          setStatus(data);
          setFailed(false);
          timer = window.setTimeout(refresh, Math.max(5_000, new Date(data.refreshAt).getTime() - Date.now()));
        })
        .catch(() => { if (live) setFailed(true); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [preview]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function setAttendance(occurrence: ClassOccurrence, next: AttendanceStatus) {
    if (!preview) {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: occurrence.date,
          classNumber: occurrence.classNumber,
          status: next,
          note: occurrence.note,
        }),
      });
      if (!response.ok) throw new Error("Could not save class attendance");
    }

    setStatus((current) => {
      if (!current) return current;
      const update = (item: ClassOccurrence) =>
        item.date === occurrence.date && item.classNumber === occurrence.classNumber
          ? { ...item, status: next }
          : item;
      return {
        ...current,
        currentClasses: current.currentClasses.map(update),
        nextClass: current.nextClass ? update(current.nextClass) : null,
      };
    });
  }

  const showCurrent = status === null || failed || status.currentClasses.length > 0;

  return (
    <section className="fade-up grid gap-3 sm:grid-cols-2" aria-label="Live campus and class status" aria-live="polite">
      <div className="min-h-32 rounded-xl border border-neutral-200 p-5 sm:col-span-2 dark:border-neutral-800">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">On campus now</h2>
        {status === null && !failed ? (
          <div className="mt-4 flex animate-pulse flex-col gap-3" aria-label="Loading campus status">
            <span className="h-5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
            <span className="h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ) : failed ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Campus status is unavailable right now.</p>
        ) : status!.onCampus.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No group members found.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3">
            {status!.onCampus.map((person) => <Person key={person.key} person={person} />)}
          </div>
        )}
      </div>

      {showCurrent && (
        <div className="min-h-32 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Current class</h2>
          {status === null && !failed ? (
            <div className="mt-4 flex animate-pulse flex-col gap-3" aria-label="Loading class status">
              <span className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
              <span className="h-4 w-56 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ) : failed ? (
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Class status is unavailable right now.</p>
          ) : !status!.hasScheduledClasses ? (
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No scheduled classes this term.</p>
          ) : status!.currentClasses.length > 0 ? (
            <div className="mt-4"><ClassLine occurrence={status!.currentClasses[0]} label="In class now" now={clock} onStatusChange={setAttendance} /></div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No class right now.</p>
          )}
        </div>
      )}

      <div className={`min-h-32 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800 ${showCurrent ? "" : "sm:col-span-2"}`}>
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Next class</h2>
        {status === null && !failed ? (
          <div className="mt-4 flex animate-pulse flex-col gap-3" aria-label="Loading next class">
            <span className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
            <span className="h-4 w-56 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ) : failed ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Class status is unavailable right now.</p>
        ) : !status!.hasScheduledClasses ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No scheduled classes this term.</p>
        ) : status!.nextClass ? (
          <div className="mt-4"><ClassLine occurrence={status!.nextClass} label="Next class" now={clock} onStatusChange={setAttendance} /></div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No upcoming classes.</p>
        )}
      </div>
    </section>
  );
}
