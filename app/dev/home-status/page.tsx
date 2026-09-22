import { ClassStatusCard, type HomeStatus } from "@/components/ClassStatusCard";
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
      { key: "ada", displayName: "Ada", image: null, color: "#ef4444", isCurrentUser: false, campus: "Burnaby" },
      { key: "bo", displayName: "Bo", image: null, color: "#3b82f6", isCurrentUser: false, campus: "Burnaby" },
      { key: "you", displayName: "Martin", image: null, color: "#0f8a6d", isCurrentUser: true, campus: "Burnaby" },
    ],
    currentClasses: inClass ? [{
      course: "CMPT 225",
      title: "Data Structures and Algorithms",
      section: "D100 LEC",
      campus: "Burnaby",
      date: now.date,
      start: currentStart,
      end: currentEnd,
      status: "going",
    }] : [],
    nextClass: {
      course: "MATH 232",
      title: "Elementary Linear Algebra",
      section: "D100 LEC",
      campus: "Burnaby",
      date: nextDate,
      start: inClass ? Math.min(now.minutes + 90, 23 * 60 - 50) : 12 * 60,
      end: inClass ? Math.min(now.minutes + 140, 23 * 60) : 13 * 60,
      status: "going",
    },
    hasScheduledClasses: true,
    refreshAt: "2099-01-01T00:00:00.000Z",
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 pb-20 sm:pb-24">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Development preview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Homepage status cards</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Fixture data for the signed-in homepage. The live page uses the authenticated schedule endpoint.</p>
      </header>
      <ClassStatusCard preview={preview} />
    </main>
  );
}
