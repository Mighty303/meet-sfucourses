import type { HomeStatus } from "@/components/ClassStatusCard";
import { GroupsHome, type Membership } from "@/components/GroupsHome";
import { campusNow } from "@/lib/class-status";

function tomorrow(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * Fixture for reviewing the signed-in homepage status cards without a live
 * account or SFU schedule. It is intentionally not linked from navigation.
 */
export default function HomeStatusPreviewPage() {
  const now = campusNow(new Date());
  const inClass = now.minutes < 22 * 60;
  const currentStart = inClass ? Math.max(0, now.minutes - 30) : 10 * 60;
  const currentEnd = inClass ? Math.min(23 * 60 + 59, now.minutes + 30) : 11 * 60;
  const nextDate = inClass ? now.date : tomorrow(now.date);
  const preview: HomeStatus = {
    onCampus: [
      { key: "ada", displayName: "Ada", image: null, color: "#ef4444", isCurrentUser: false, status: "going", statusUpdatedAt: "2026-09-22T14:18:00.000Z", classLabel: "CMPT 225 D100 LEC", campus: "Burnaby" },
      { key: "bo", displayName: "Bo", image: null, color: "#3b82f6", isCurrentUser: false, status: "remote", statusUpdatedAt: "2026-09-22T13:45:00.000Z", classLabel: "MATH 232 D100 LEC", campus: null },
      { key: "you", displayName: "Martin", image: null, color: "#0f8a6d", isCurrentUser: true, status: "away", statusUpdatedAt: null, classLabel: "Next CMPT 419 D500 LEC · 2:30 PM", campus: null },
      { key: "kaleigh", displayName: "Kaleigh", image: null, color: "#ec4899", isCurrentUser: false, status: "away", statusUpdatedAt: "2026-09-22T12:30:00.000Z", classLabel: "Done CMPT 225 D100 LEC · 12:00 PM", campus: null },
    ],
    currentClasses: inClass ? [{
      course: "CMPT 225",
      title: "Data Structures and Algorithms",
      section: "D100 LEC",
      classNumber: "1001",
      campus: "Burnaby",
      date: now.date,
      start: currentStart,
      end: currentEnd,
      status: "going",
      selectedStatus: null,
      note: null,
      updatedAt: null,
    }] : [],
    nextClass: {
      course: "MATH 232",
      title: "Elementary Linear Algebra",
      section: "D100 LEC",
      classNumber: "2001",
      campus: "Burnaby",
      date: nextDate,
      start: inClass ? Math.min(now.minutes + 90, 23 * 60 - 50) : 12 * 60,
      end: inClass ? Math.min(now.minutes + 140, 23 * 60) : 13 * 60,
      status: "going",
      selectedStatus: null,
      note: null,
      updatedAt: null,
    },
    hasScheduledClasses: true,
    refreshAt: "2099-01-01T00:00:00.000Z",
  };

  const memberships: Membership[] = [
    {
      memberId: 1,
      displayName: "Martin",
      color: "#3b82f6",
      classNumbers: ["1001", "1002", "1003", "1004", "1005", "1006"],
      group: { id: 1, code: "EDISON", name: "edison n martin", term: "2026-fall", image: "/globe.svg" },
      members: [
        { id: 1, displayName: "Martin", color: "#3b82f6", image: null, hasSchedule: true },
        { id: 2, displayName: "Edwind Wind", color: "#f97316", image: null, hasSchedule: true },
      ],
    },
    {
      memberId: 3,
      displayName: "Martin",
      color: "#a855f7",
      classNumbers: ["2001", "2002", "2003", "2004", "2005", "2006"],
      group: { id: 2, code: "STUDY", name: "cmpt study crew", term: "2026-fall", image: null },
      members: [
        { id: 3, displayName: "Martin", color: "#a855f7", image: null, hasSchedule: true },
        { id: 4, displayName: "Brandon Chan", color: "#f97316", image: null, hasSchedule: true },
        { id: 5, displayName: "Isabelle Kwan", color: "#eab308", image: null, hasSchedule: true },
        { id: 6, displayName: "Ada", color: "#10b981", image: null, hasSchedule: true },
      ],
    },
    {
      memberId: 7,
      displayName: "Martin",
      color: "#ef4444",
      classNumbers: ["3001", "3002", "3003", "3004", "3005", "3006"],
      group: { id: 3, code: "TABLE", name: "subtable", term: "2026-fall", image: "/file.svg" },
      members: [
        { id: 7, displayName: "Martin", color: "#ef4444", image: null, hasSchedule: true },
        { id: 8, displayName: "Kaleigh", color: "#ec4899", image: null, hasSchedule: true },
        { id: 9, displayName: "Calv", color: "#f97316", image: null, hasSchedule: true },
        { id: 10, displayName: "Bo", color: "#06b6d4", image: null, hasSchedule: true },
      ],
    },
  ];

  return (
    <div>
      <header className="mx-auto w-full max-w-4xl px-6 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Development preview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Signed-in homepage</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Fixture data for the homepage status and group cards. The live page uses authenticated endpoints.</p>
      </header>
      <GroupsHome preview={{ status: preview, memberships }} />
    </div>
  );
}
