import { auth } from "@/auth";
import { canEditMember, canManageMember, findGroup } from "./groups";

export type MemberAccess =
  | { id: number; groupId: number; term: string }
  | { error: string; status: 403 | 404 };

export interface MemberAccessOptions {
  /**
   * Let the group's admin through as well. Only for the edits the whole group
   * reads — the name and colour on the grid, and whether the row is there at
   * all. A schedule stays its member's own, so the courses and calendar routes
   * leave this off and keep the your-row-only rule.
   */
  adminToo?: boolean;
}

/**
 * Resolves a member inside a group and checks the caller may edit it. Owned
 * rows require their owner; rows without an owner predate sign-in and stay open
 * to anyone with the invite code. Shared by every route that writes to a member.
 */
export async function authorizeMember(
  code: string,
  memberId: string,
  opts: MemberAccessOptions = {}
): Promise<MemberAccess> {
  const group = await findGroup(code.toUpperCase());
  if (!group) return { error: "group not found", status: 404 };

  const id = Number(memberId);
  if (!Number.isInteger(id)) {
    return { error: "member not in this group", status: 404 };
  }

  const session = await auth();
  const appUserId = session?.appUserId ?? null;
  const allowed = opts.adminToo
    ? await canManageMember(id, group.id, appUserId)
    : await canEditMember(id, group.id, appUserId);
  if (!allowed) return { error: "that's not your schedule to edit", status: 403 };

  return { id, groupId: group.id, term: group.term };
}
