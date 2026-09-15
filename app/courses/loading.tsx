import { Bar } from "@/components/Skeleton";

/**
 * The heading and the shape of the search box, so the click lands on something
 * that is already the right size. The chips aren't drawn: how many there are is
 * the answer this page exists to give, and guessing at it in grey would be the
 * one placeholder that could mislead.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 pb-20 sm:pb-24">
      <div className="flex flex-col gap-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-3/4" />
      </div>
      <div className="flex animate-pulse flex-col gap-5" aria-hidden>
        <Bar className="h-4 w-24" />
        <Bar className="h-10 w-full" />
      </div>
    </main>
  );
}
