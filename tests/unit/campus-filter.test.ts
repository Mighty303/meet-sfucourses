import { describe, expect, it } from "vitest";
import {
  freeIndicesForCampus,
  scheduleCampuses,
  windowMatchesCampus,
} from "@/lib/campus-filter";
import { availabilityBands, type FreeWindow } from "@/lib/overlap";
import { toMinutes } from "@/lib/sfu";
import { block, DAY_END, DAY_START, online, skipped } from "../fixtures/blocks";

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

  it("counts only free members anchored to the selected campus", () => {
    const bands = availabilityBands({
      members: [
        {
          name: "Ada",
          busy: [block("Mo", "09:00", "10:00"), block("Mo", "12:00", "13:00")],
        },
        {
          name: "Bo",
          busy: [
            block("Mo", "09:00", "10:00", { campus: "Surrey" }),
            block("Mo", "12:00", "13:00", { campus: "Surrey" }),
          ],
        },
      ],
      dayStart: DAY_START,
      dayEnd: DAY_END,
      days: ["Mo"],
    });
    const gap = bands.find((band) => band.start === toMinutes("10:00"))!;

    expect(freeIndicesForCampus(gap, null)).toEqual([0, 1]);
    expect(freeIndicesForCampus(gap, "Burnaby")).toEqual([0]);
    expect(freeIndicesForCampus(gap, "Surrey")).toEqual([1]);
  });

  it("keeps only between-class windows shared at the selected campus", () => {
    const base: FreeWindow = {
      day: "Mo",
      start: toMinutes("10:00"),
      end: toMinutes("12:00"),
      campuses: ["Burnaby"],
      sharedCampus: true,
      betweenClasses: true,
      onCampus: ["Ada", "Bo"],
    };

    expect(windowMatchesCampus(base, null)).toBe(true);
    expect(windowMatchesCampus(base, "Burnaby")).toBe(true);
    expect(windowMatchesCampus(base, "Surrey")).toBe(false);
    expect(windowMatchesCampus({ ...base, betweenClasses: false }, "Burnaby")).toBe(false);
    expect(
      windowMatchesCampus(
        { ...base, campuses: ["Burnaby", "Surrey"], sharedCampus: false },
        "Burnaby"
      )
    ).toBe(false);
  });
});
