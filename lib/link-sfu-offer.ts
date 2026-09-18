/**
 * Whether the profile should offer linking an SFU Computing ID.
 *
 * The button is for accounts that do not already hold an SFU door. Once SFU is
 * on this account (live row or a tombstone that still opens it), the CTA hides
 * — a separate SFU row elsewhere is exactly when they still need the link path,
 * and that case is `sfu: false` here until the fold completes.
 */

export type LinkSfuOffer = "link" | "linked" | "fold" | "none";

export function linkSfuOffer(
  doors: { sfu: boolean } | null | undefined,
  casOpen: boolean
): LinkSfuOffer {
  if (!doors) return "none";
  if (doors.sfu) return "linked";
  if (casOpen) return "link";
  // CAS off: keep the generic fold blurb for Google/password pairs.
  return "fold";
}
