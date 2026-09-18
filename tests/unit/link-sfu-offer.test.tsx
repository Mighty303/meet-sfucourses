import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LinkSfuCta } from "@/components/LinkSfuCta";
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

describe("LinkSfuCta", () => {
  it("renders the Link SFU button for the link offer", () => {
    const html = renderToStaticMarkup(<LinkSfuCta offer="link" />);
    expect(html).toContain("Link your SFU ID");
    expect(html).toContain("keep the groups on this account");
    expect(html).toContain("bg-[#a6192e]");
    // Starts CAS from the profile button — no middle /profile/link?intent=sfu hop.
    expect(html).not.toContain("/profile/link?intent=sfu");
    expect(html).not.toContain("SFU ID linked");
  });

  it("hides the button once SFU is linked", () => {
    const html = renderToStaticMarkup(<LinkSfuCta offer="linked" />);
    expect(html).toContain("SFU ID linked");
    expect(html).not.toContain("Link your SFU ID");
  });

  it("renders nothing for none", () => {
    expect(renderToStaticMarkup(<LinkSfuCta offer="none" />)).toBe("");
  });
});
