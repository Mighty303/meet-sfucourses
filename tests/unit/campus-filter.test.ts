import { describe, expect, it } from "vitest";
import {
  membersAtCampus,
  scheduleCampuses,
} from "@/lib/campus-filter";
import { block, online, skipped } from "../fixtures/blocks";

describe("campus filters", () => {
  it("lists attended campuses for the visible members", () => {
    const members = [{ id: 1 }, { id: 2 }];
    const busy = {
      1: [block("Mo", "09:00", "10:00", { campus: "Surrey" }), online("Mo", "11:00", "12:00")],
      2: [block("Tu", "09:00", "10:00"), skipped("Tu", "11:00", "12:00", { campus: "Vancouver" })],
    };

    expect(scheduleCampuses(members, busy)).toEqual(["Burnaby", "Surrey"]);
    expect(scheduleCampuses([members[0]], busy)).toEqual(["Surrey"]);
  });

  it("selects members with a class at the chosen campus, including both-campus members", () => {
    const members = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const busy = {
      1: [block("Mo", "09:00", "10:00")],
      2: [block("Mo", "09:00", "10:00", { campus: "Surrey" })],
      3: [block("Mo", "09:00", "10:00"), block("Tu", "09:00", "10:00", { campus: "Surrey" })],
    };

    expect([...membersAtCampus(members, busy, "Burnaby")]).toEqual([1, 3]);
    expect([...membersAtCampus(members, busy, "Surrey")]).toEqual([2, 3]);
    expect([...membersAtCampus(members, busy, null)]).toEqual([1, 2, 3]);
  });
});
