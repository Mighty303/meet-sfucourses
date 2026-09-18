// Which row keeps its id, in isolation from the database that carries it out.
//
// Empty shells lose to accounts with groups. Otherwise the SFU row survives so
// the merged account wears the verified @sfu.ca address.

import { describe, expect, it } from "vitest";
import { chooseSurvivor } from "@/lib/account-link";

const google = { id: 1, hasSfu: false, groups: 4 };
const password = { id: 2, hasSfu: false, groups: 0 };
const sfuEmpty = { id: 3, hasSfu: true, groups: 0 };
const sfuWithGroups = { id: 4, hasSfu: true, groups: 2 };

describe("chooseSurvivor", () => {
  it("keeps the account with groups when the SFU side is an empty shell", () => {
    expect(chooseSurvivor(google, sfuEmpty)).toEqual({ survivorId: 1, absorbedId: 3 });
    expect(chooseSurvivor(sfuEmpty, google)).toEqual({ survivorId: 1, absorbedId: 3 });
  });

  it("keeps the SFU row when both sides have groups", () => {
    expect(chooseSurvivor(google, sfuWithGroups)).toEqual({ survivorId: 4, absorbedId: 1 });
    expect(chooseSurvivor(sfuWithGroups, google)).toEqual({ survivorId: 4, absorbedId: 1 });
  });

  it("keeps the SFU row when both sides are empty", () => {
    expect(chooseSurvivor({ id: 1, hasSfu: false, groups: 0 }, sfuEmpty)).toEqual({
      survivorId: 3,
      absorbedId: 1,
    });
  });

  it("keeps the initiator when neither side is an SFU account and both are empty or both have groups", () => {
    expect(
      chooseSurvivor({ id: 1, hasSfu: false, groups: 0 }, { id: 2, hasSfu: false, groups: 0 })
    ).toEqual({ survivorId: 1, absorbedId: 2 });
    expect(
      chooseSurvivor({ id: 1, hasSfu: false, groups: 2 }, { id: 2, hasSfu: false, groups: 3 })
    ).toEqual({ survivorId: 1, absorbedId: 2 });
  });

  it("prefers the side with groups when neither is SFU", () => {
    expect(chooseSurvivor(google, password)).toEqual({ survivorId: 1, absorbedId: 2 });
    expect(chooseSurvivor(password, google)).toEqual({ survivorId: 1, absorbedId: 2 });
  });

  it("refuses two SFU accounts", () => {
    expect(chooseSurvivor(sfuEmpty, sfuWithGroups)).toEqual({ error: "two-sfu-accounts" });
  });

  it("refuses an account linked to itself", () => {
    expect(chooseSurvivor(sfuEmpty, { id: 3, hasSfu: true, groups: 0 })).toEqual({
      error: "same-account",
    });
  });
});
