"use client";

import { useEffect, useState } from "react";
import { campusNow, classStatus, type ClassMeeting, type ClassOccurrence } from "@/lib/class-status";
import { formatTime } from "@/lib/sfu";

function dayLabel(date: string, now: Date): string {
  const today = campusNow(now).date;
  if (date === today) return "Today";
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function Meeting({ meeting, label, now }: { meeting: ClassOccurrence; label: string; now: Date }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{label}</p>
      <p className="text-lg font-semibold tracking-tight">{meeting.course} <span className="font-normal text-neutral-500 dark:text-neutral-400">{meeting.section}</span></p>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{meeting.title}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {dayLabel(meeting.date, now)} · {formatTime(meeting.start)}–{formatTime(meeting.end)}
        {meeting.campus ? ` · ${meeting.campus}` : ""}
      </p>
    </div>
  );
}

/** The home page's live class status. The timer handles class boundaries while
 * a tab stays open; visibility refresh catches schedule edits made elsewhere. */
export function ClassStatusCard() {
  const [meetings, setMeetings] = useState<ClassMeeting[] | null | undefined>(undefined);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = () => {
      fetch("/api/me/next-class")
        .then((res) => { if (!res.ok) throw new Error("Could not load classes"); return res.json(); })
        .then((data) => { if (live) { setMeetings(data.meetings); setNow(new Date()); } })
        .catch(() => { if (live) setMeetings(null); });
    };
    refresh();
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const status = meetings && now ? classStatus(meetings, now) : null;

  return (
    <section className="fade-up rounded-xl border border-neutral-200 p-5 dark:border-neutral-800" aria-label="Your class status" aria-live="polite">
      {meetings === undefined ? (
        <div className="flex animate-pulse flex-col gap-3" aria-label="Loading class status">
          <span className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
          <span className="h-6 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
          <span className="h-4 w-56 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
      ) : meetings === null ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Could not load your class schedule right now.</p>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">No scheduled classes this term</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Your saved courses have no meeting times to show.</p>
        </div>
      ) : status?.current.length ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Meeting meeting={status.current[0]} label="In class now" now={now!} />
          {status.next && <Meeting meeting={status.next} label="Next class" now={now!} />}
        </div>
      ) : status?.next ? (
        <Meeting meeting={status.next} label="Next class" now={now!} />
      ) : (
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">No upcoming classes</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">There are no more scheduled meetings in the coming week.</p>
        </div>
      )}
    </section>
  );
}
