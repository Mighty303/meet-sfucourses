/**
 * Loading placeholders shaped like the thing that's about to replace them, so
 * the page doesn't jump when the fetch lands. Colours and pulse match the
 * signed-out button placeholder in AuthButton.
 */

import { COLUMN_HEIGHT, DAY_CELL, DAY_TRACK, GRID_SCROLLER, LEGEND_HEIGHT } from "@/lib/grid-layout";

/** One grey bar. Sizing comes from the caller — this only carries the tone. */
export function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={`rounded bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

/** Avatar-sized dot, for the member chips and profile picture slots. */
export function Dot({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

const HOUR_LINES = Array.from({ length: 15 }, (_, i) => (i / 14) * 100);

// Rough class blocks per weekday: [top%, height%]. Hand-picked rather than
// random so the placeholder is stable across renders.
const BLOCKS: [number, number][][] = [
  [[8, 14], [38, 10]],
  [[20, 12], [55, 16]],
  [[8, 14], [44, 10], [70, 8]],
  [[25, 18]],
  [[12, 10], [50, 12]],
];

function WeekGridSkeleton() {
  return (
    <div className={`animate-pulse ${GRID_SCROLLER}`} aria-hidden>
      {/* Stands in for whichever legend is about to load, so the real grid
          lands where the placeholder was instead of 52px lower. */}
      <div className={`mb-2 flex flex-col items-center justify-center gap-1 ${LEGEND_HEIGHT}`}>
        <Bar className="h-3.5 w-56" />
        <Bar className="h-3 w-72" />
      </div>

      <div className="flex gap-2 text-xs">
        <div className="w-12 shrink-0">
          <div className="mb-1 h-4" />
          <div className={`relative ${COLUMN_HEIGHT}`}>
            {HOUR_LINES.map((top) => (
              // Positions are data, so they stay inline rather than becoming
              // a fixed set of utility classes.
              <Bar key={top} className="absolute right-1 h-2.5 w-8 -translate-y-1/2" style={{ top: `${top}%` }} />
            ))}
          </div>
        </div>

        <div className={DAY_TRACK}>
          {BLOCKS.map((blocks, day) => (
            <div key={day} className={DAY_CELL}>
              <div className="mb-1 flex justify-center">
                <Bar className="h-3 w-8" />
              </div>
              <div
                className={`relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 ${COLUMN_HEIGHT}`}
              >
                {HOUR_LINES.map((top) => (
                  <div
                    key={top}
                    className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
                    style={{ top: `${top}%` }}
                  />
                ))}
                {blocks.map(([top, height], i) => (
                  <div
                    key={i}
                    className="absolute inset-x-1 rounded-md bg-neutral-200 dark:bg-neutral-800"
                    style={{ top: `${top}%`, height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The fixed-width member rail beside the calendar on desktop. */
function MemberListSkeleton() {
  return (
    <aside className="relative min-h-0 animate-pulse" aria-hidden>
      <div className="flex flex-col gap-2 lg:absolute lg:inset-0 lg:min-h-0">
        <div className="flex items-start justify-end gap-x-3">
          <div className="mr-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Bar className="h-4 w-36" />
            <Bar className="h-3 w-40" />
          </div>
          <Bar className="h-8 w-8 shrink-0" />
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:auto-rows-max lg:grid-cols-1 lg:overflow-hidden">
          {["w-24", "w-20", "w-28", "w-16", "w-24", "w-20"].map((width, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 dark:border-neutral-700"
            >
              <div className="flex items-center gap-2">
                <Bar className="h-4 w-4 shrink-0" />
                <Dot className="h-[18px] w-[18px] shrink-0" />
                <Bar className={`h-3.5 ${width}`} />
              </div>
              <div className="flex gap-1.5 pl-6">
                <Bar className="h-5 w-16" />
                <Bar className="h-5 w-14" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** The group page while the group state is in flight. */
export function GroupPageSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-5 sm:p-8" aria-busy>
      <span className="sr-only">Loading schedule…</span>

      <div className="flex animate-pulse flex-col gap-3" aria-hidden>
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
          <div className="flex flex-col gap-2">
            <Bar className="h-7 w-48" />
            <Bar className="h-4 w-40" />
          </div>
          <Bar className="h-9 w-9 shrink-0" />
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-9 w-64 max-w-full sm:w-96" />
          <Bar className="h-9 w-28 shrink-0" />
          <Bar className="h-9 w-9 shrink-0" />
        </div>
      </div>

      <div className="-mt-2 flex animate-pulse flex-col gap-2" aria-hidden>
        <Bar className="h-4 w-24" />
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-9 w-32 rounded-full" />
          <Bar className="h-9 w-28 rounded-full" />
          <Bar className="h-9 w-36 rounded-full" />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-stretch xl:grid-cols-[16rem_minmax(0,1fr)]">
        <MemberListSkeleton />

        <div className="@container flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex animate-pulse flex-wrap items-center justify-center gap-2 @min-[68rem]:grid @min-[68rem]:grid-cols-[1fr_auto_1fr]" aria-hidden>
            <div />
            <div className="flex items-center gap-2">
              <Bar className="h-9 w-10" />
              <Bar className="h-5 w-48" />
              <Bar className="h-9 w-10" />
            </div>
            <div className="flex items-center justify-center gap-2 @min-[68rem]:justify-self-end">
              <Bar className="h-9 w-40" />
              <Bar className="h-9 w-40" />
            </div>
          </div>

          <WeekGridSkeleton />
        </div>
      </div>
    </main>
  );
}

/**
 * A group's settings page while the group is in flight: the name and term it
 * opens with, the member rows the admin acts on, and the destructive pair at
 * the bottom. The member count is fixed at three: a placeholder that guessed
 * the real one would need the fetch it is standing in for.
 */
export function GroupSettingsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy>
      <span className="sr-only">Loading group settings…</span>

      <header className="flex flex-col gap-2" aria-hidden>
        <Bar className="h-7 w-44" />
        <Bar className="h-4 w-56" />
      </header>

      {/* Name, then term: two labelled fields in one card, the way the create
          form stacks them. */}
      <section
        className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        aria-hidden
      >
        {["w-20", "w-12"].map((label) => (
          <div key={label} className="flex flex-col gap-1.5">
            <Bar className={`h-3.5 ${label}`} />
            <Bar className="h-9 w-full sm:w-80" />
          </div>
        ))}
        <Bar className="h-9 w-28" />
      </section>

      <section className="flex flex-col gap-3" aria-hidden>
        <Bar className="h-4 w-24" />
        <ul className="flex flex-col gap-1.5">
          {["w-28", "w-20", "w-24"].map((w, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            >
              <Dot className="h-3 w-3 shrink-0" />
              <Dot className="h-[18px] w-[18px] shrink-0" />
              <Bar className={`h-3.5 ${w}`} />
              <Bar className="ml-auto h-7 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      {/* Leave and delete, boxed in red the way the armed buttons in the ⋮
          menu are. */}
      <section
        className="flex flex-col gap-3 rounded-lg border border-red-200 p-4 dark:border-red-900/50"
        aria-hidden
      >
        <Bar className="h-4 w-32" />
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-9 w-28" />
          <Bar className="h-9 w-32" />
        </div>
      </section>
    </div>
  );
}

/** Everything below the "Your profile" heading, while /api/me is in flight. */
export function ProfileBodySkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy>
      <span className="sr-only">Loading your profile…</span>

      <section
        className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        aria-hidden
      >
        <Dot className="h-14 w-14 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Bar className="h-4 w-40" />
          <Bar className="h-3.5 w-56" />
          <Bar className="mt-1 h-8 w-36" />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-hidden>
        <Bar className="h-4 w-28" />
        {[0, 1].map((i) => (
          <article
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-center gap-2">
              <Bar className="h-3 w-3 shrink-0" />
              <Bar className="h-4 w-32" />
              <Bar className="h-3.5 w-28" />
              <Bar className="ml-auto h-3.5 w-24" />
            </div>
            <div className="flex items-center gap-3">
              <Bar className="h-3 w-24 shrink-0" />
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <Dot key={j} className="h-5 w-5" />
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Bar className="h-10 flex-1" />
              <Bar className="h-10 w-24 shrink-0" />
            </div>
            <Bar className="h-9 w-full" />
          </article>
        ))}
      </section>

      <section
        className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800"
        aria-hidden
      >
        <Bar className="h-4 w-28" />
        <Bar className="h-9 w-36" />
        <Bar className="h-3 w-64" />
      </section>
    </div>
  );
}
