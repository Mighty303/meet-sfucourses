import { onCampus, type BusyBlock } from "@/lib/overlap";

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

/** Members with at least one attended in-person class at the selected campus. */
export function membersAtCampus(
  members: CampusMember[],
  busyByMember: Record<number, BusyBlock[]>,
  campus: string | null
): Set<number> {
  if (campus === null) return new Set(members.map((member) => member.id));
  return new Set(
    members
      .filter((member) =>
        onCampus(busyByMember[member.id] ?? []).some((block) => block.campus === campus)
      )
      .map((member) => member.id)
  );
}
