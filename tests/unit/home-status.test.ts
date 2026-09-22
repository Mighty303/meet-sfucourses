import { describe, expect, it } from "vitest";
import { campusPresence } from "@/lib/home-status";

describe("campus presence", () => {
  it("covers the span between attended in-person classes", () => {
    expect(campusPresence([
      { start: 9 * 60, end: 10 * 60, campus: "Burnaby" },
      { start: 14 * 60, end: 15 * 60, campus: "Burnaby" },
    ], 12 * 60)).toEqual({ campus: "Burnaby", nextChange: 15 * 60 });
  });

  it("does not count time before arrival or after the last class", () => {
    const blocks = [{ start: 9 * 60, end: 10 * 60, campus: "Burnaby" }];
    expect(campusPresence(blocks, 8 * 60 + 59).campus).toBeNull();
    expect(campusPresence(blocks, 10 * 60).campus).toBeNull();
  });

  it("ignores skipped and online classes", () => {
    expect(campusPresence([
      { start: 9 * 60, end: 10 * 60, campus: "Burnaby", status: "remote" },
      { start: 11 * 60, end: 12 * 60, campus: "Burnaby", status: "skipping" },
    ], 9 * 60 + 30).campus).toBeNull();
  });

  it("prefers the preceding campus between different campuses", () => {
    expect(campusPresence([
      { start: 9 * 60, end: 10 * 60, campus: "Burnaby" },
      { start: 14 * 60, end: 15 * 60, campus: "Surrey" },
    ], 12 * 60).campus).toBe("Burnaby");
  });
});
