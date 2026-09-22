import { onCampus, type AvailabilityBand, type BusyBlock, type FreeWindow } from "@/lib/overlap";

interface CampusMember {
  id: number;
}

/** Campuses represented by the visible members' attended classes this week. */
export function scheduleCampuses(
  members: CampusMember[],
  busyByMember: Record<number, BusyBlock[]>
): string[] {
  const campuses = new Set<string>();
  for (const member of members) {
    for (const block of onCampus(busyByMember[member.id] ?? [])) {
      if (block.campus) campuses.add(block.campus);
    }
  }
  return [...campuses].sort((a, b) => a.localeCompare(b));
}

/** Free-member indices that count for the selected campus. */
export function freeIndicesForCampus(
  band: AvailabilityBand,
  campus: string | null
): number[] {
  if (campus === null) return band.freeIndices;
  return band.freeIndices.filter((index) => band.freeCampusByIndex[index] === campus);
}

/** Whether an all-member free window is usable at the selected campus. */
export function windowMatchesCampus(window: FreeWindow, campus: string | null): boolean {
  if (campus === null) return true;
  return window.betweenClasses && window.sharedCampus && window.campuses.includes(campus);
}
