// Which status is in force for one class on one date. The table stores
// deviations only, so most lookups find nothing and must fall back to "going" —
// getting the precedence wrong silently marks people absent.

import { describe, expect, it } from "vitest";
import { isAttendanceStatus, resolveStatus, type AttendanceRow } from "@/lib/attendance-status";

const ADA = 1;
const BO = 2;
const MON = "2026-10-12";
const TUE = "2026-10-13";

const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  userId: ADA,
  onDate: MON,
  classNumber: null,
  status: "skipping",
  note: null,
  ...over,
});

describe("resolveStatus", () => {
  it("defaults to going when nothing is stored", () => {
    expect(resolveStatus([], ADA, MON, "1234")).toEqual({ status: "going", note: null });
  });

  it("applies a whole-day row to every class on it", () => {
    expect(resolveStatus([row({ status: "remote", note: "sick" })], ADA, MON, "1234")).toEqual({
      status: "remote",
      note: "sick",
    });
  });

  it("lets a class-level row beat the whole-day row", () => {
    const rows = [row({ status: "skipping" }), row({ classNumber: "1234", status: "remote", note: "zoom" })];
    expect(resolveStatus(rows, ADA, MON, "1234")).toEqual({ status: "remote", note: "zoom" });
    // ...and leaves the other classes that day on the day row.
    expect(resolveStatus(rows, ADA, MON, "5678")).toEqual({ status: "skipping", note: null });
  });

  it("wins with a class row no matter which order the rows arrive in", () => {
    const rows = [row({ classNumber: "1234", status: "remote" }), row({ status: "skipping" })];
    expect(resolveStatus(rows, ADA, MON, "1234").status).toBe("remote");
  });

  it("applies a whole-day row to a block with no class number", () => {
    // Custom busy blocks carry no classNumber, so they inherit the day.
    expect(resolveStatus([row({ status: "remote" })], ADA, MON, null).status).toBe("remote");
  });

  it("does not let a class row leak onto a block with no class number", () => {
    expect(resolveStatus([row({ classNumber: "1234", status: "skipping" })], ADA, MON, null).status).toBe("going");
  });

  it("ignores another person's rows", () => {
    expect(resolveStatus([row({ userId: BO, status: "skipping" })], ADA, MON, "1234").status).toBe("going");
  });

  it("ignores another date's rows", () => {
    expect(resolveStatus([row({ onDate: TUE, status: "skipping" })], ADA, MON, "1234").status).toBe("going");
  });

  it("carries the note of whichever row won", () => {
    const rows = [row({ status: "skipping", note: "day off" }), row({ classNumber: "1234", status: "remote", note: null })];
    expect(resolveStatus(rows, ADA, MON, "1234").note).toBeNull();
    expect(resolveStatus(rows, ADA, MON, "5678").note).toBe("day off");
  });
});

describe("isAttendanceStatus", () => {
  it("accepts the three stored values", () => {
    expect(["going", "skipping", "remote"].every(isAttendanceStatus)).toBe(true);
  });

  it("rejects anything else, including the display label", () => {
    // "Online" is what the UI shows; "remote" is what the column holds.
    for (const bad of ["Online", "GOING", "", null, undefined, 1, {}]) {
      expect(isAttendanceStatus(bad)).toBe(false);
    }
  });
});
