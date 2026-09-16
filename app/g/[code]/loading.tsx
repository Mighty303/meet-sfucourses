import { GroupPageSkeleton } from "@/components/Skeleton";

/**
 * The page renders this same skeleton behind its own Suspense boundary, but
 * that one only covers the wait for the group's data — it can't show until
 * the segment itself has arrived. This one covers the navigation.
 *
 * It also buys the prefetch: /g/[code] is a dynamic route, and a dynamic route
 * is only prefetched down to its nearest loading boundary, so without this file
 * there was nothing for Next to warm up when a group card scrolled into view.
 */
export default function Loading() {
  return <GroupPageSkeleton />;
}
