import { describe, expect, it } from "vitest";
import { linkSfuOffer } from "@/lib/link-sfu-offer";

describe("linkSfuOffer", () => {
  it("offers Link SFU when CAS is on and this account has no SFU door", () => {
    expect(linkSfuOffer({ sfu: false }, true)).toBe("link");
  });

  it("shows linked status when SFU is already on the account", () => {
    expect(linkSfuOffer({ sfu: true }, true)).toBe("linked");
    expect(linkSfuOffer({ sfu: true }, false)).toBe("linked");
  });

  it("falls back to the generic fold blurb when CAS is off and SFU is not linked", () => {
    expect(linkSfuOffer({ sfu: false }, false)).toBe("fold");
  });

  it("hides everything until doors are known", () => {
    expect(linkSfuOffer(null, true)).toBe("none");
    expect(linkSfuOffer(undefined, true)).toBe("none");
  });
});
