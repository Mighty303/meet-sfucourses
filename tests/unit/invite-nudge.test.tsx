import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FirstSaveInviteNudge } from "@/components/CoursesPanel";

describe("FirstSaveInviteNudge", () => {
  it("points home users at creating a group", () => {
    const html = renderToStaticMarkup(<FirstSaveInviteNudge toGroup={false} />);
    expect(html).toContain("Nice — now invite the people you want to meet");
    expect(html).toContain("Create a group and send them the link");
    expect(html).not.toContain("Share the invite link from your group");
  });

  it("points group returners at sharing the invite", () => {
    const html = renderToStaticMarkup(<FirstSaveInviteNudge toGroup />);
    expect(html).toContain("Share the invite link from your group");
  });
});
