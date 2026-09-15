import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountGate } from "@/components/AccountGate";
import { SfuDoorProvider } from "@/components/SfuDoor";

/**
 * The gate shipped without the SFU door: /signin asked `casEnabled()` itself,
 * but the modal is opened from a page that is "use client" all the way up, so
 * there was nothing in the tree to ask and the prop was never passed. Everyone
 * arriving through a group invite — most people — saw only Google and a
 * password form, while the front door offered the one sign-in that proves
 * someone is at SFU.
 *
 * Rendered rather than asserted on the props, because the failure was that a
 * value never reached the markup.
 */
describe("AccountGate", () => {
  it("offers the SFU door when the layout says it is open", () => {
    const html = renderToStaticMarkup(
      <SfuDoorProvider open>
        <AccountGate open onClose={() => {}} groupName="lol" next="/g/ABC?join=1" />
      </SfuDoorProvider>
    );
    expect(html).toContain("Continue with your SFU ID");
    expect(html).toContain("/api/auth/sfu/start?next=");
  });

  it("hides it when it is not", () => {
    const html = renderToStaticMarkup(
      <SfuDoorProvider open={false}>
        <AccountGate open onClose={() => {}} groupName="lol" next="/g/ABC?join=1" />
      </SfuDoorProvider>
    );
    expect(html).not.toContain("Continue with your SFU ID");
    expect(html).toContain("Continue with Google");
  });
});
