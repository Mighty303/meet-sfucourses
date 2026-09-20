/**
 * Join display names the way a sentence would say them: "Alex", "Alex and
 * Sam", "Alex, Sam, and Jordan". Used by the group page when naming people
 * who haven't added a schedule yet — a raw `.join(", ")` reads like a CSV.
 */
export function nameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * One line for the group week: how many schedules the overlap is using, and
 * who is still missing. Empty when everyone is in (or nobody is — other copy
 * covers that).
 */
export function partialScheduleBanner(
  scheduledCount: number,
  totalMembers: number,
  missingNames: string[]
): string | null {
  if (missingNames.length === 0 || scheduledCount === 0 || totalMembers === 0) {
    return null;
  }
  const who = nameList(missingNames);
  const verb = missingNames.length === 1 ? "hasn't" : "haven't";
  return `Showing overlap for ${scheduledCount} of ${totalMembers} — ${who} ${verb} added their schedule yet`;
}
