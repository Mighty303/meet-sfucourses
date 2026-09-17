import { GroupSettingsSkeleton } from "@/components/Skeleton";

/**
 * The same body the page shows while its own fetch is in flight, hoisted to
 * the route so the shape arrives on the gear click rather than after the
 * segment's JavaScript has loaded — and so /g/[code]/settings is prefetched
 * down to this boundary when the gear scrolls into view.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5 sm:p-8">
      <GroupSettingsSkeleton />
    </main>
  );
}
