import { describe, expect, it } from "vitest";
import { calendarPngFilename } from "@/lib/calendar-image";

describe("calendarPngFilename", () => {
  it("names the image for its group, week, and selected view", () => {
    expect(calendarPngFilename("CMPT Friends!", "2026-09-21", "heat")).toBe(
      "cmpt-friends-2026-09-21-heat.png"
    );
  });

  it("falls back when the group name has no filesystem-safe characters", () => {
    expect(calendarPngFilename("学习", "2026-09-21", "detailed")).toBe(
      "group-2026-09-21-detailed.png"
    );
  });
});
