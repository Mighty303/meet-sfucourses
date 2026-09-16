// Which row keeps its id, in isolation from the database that carries it out.
//
// The rule is short enough to state in a sentence and consequential enough to
// be worth a test of its own: the SFU row survives, because its address is the
// only one on this site anybody has vouched for, and a merged account should
// end up wearing it without a column being rewritten to get it there.

import { describe, expect, it } from "vitest";
import { chooseSurvivor } from "@/lib/account-link";

const google = { id: 1, hasSfu: false };
const password = { id: 2, hasSfu: false };
const sfu = { id: 3, hasSfu: true };

describe("chooseSurvivor", () => {
  it("keeps the SFU row when it is the one being linked to", () => {
    expect(chooseSurvivor(google, sfu)).toEqual({ survivorId: 3, absorbedId: 1 });
  });

  it("keeps the SFU row when it is the one that started the link", () => {
    expect(chooseSurvivor(sfu, google)).toEqual({ survivorId: 3, absorbedId: 1 });
  });

  it("keeps the initiator when neither side is an SFU account", () => {
    expect(chooseSurvivor(google, password)).toEqual({ survivorId: 1, absorbedId: 2 });
    expect(chooseSurvivor(password, google)).toEqual({ survivorId: 2, absorbedId: 1 });
  });

  // Two computing IDs are two people: idx_meetup_users_sfu_username means one
  // ID cannot be on two rows, so this is a mis-click rather than a link.
  it("refuses two SFU accounts", () => {
    expect(chooseSurvivor(sfu, { id: 4, hasSfu: true })).toEqual({ error: "two-sfu-accounts" });
  });

  it("refuses an account linked to itself", () => {
    expect(chooseSurvivor(sfu, { id: 3, hasSfu: true })).toEqual({ error: "same-account" });
  });
});
