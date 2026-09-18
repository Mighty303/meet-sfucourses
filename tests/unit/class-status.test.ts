import { describe, expect, it } from "vitest";
import { campusNow, classStatus, type ClassMeeting } from "@/lib/class-status";

const monday: ClassMeeting = {
  course: "CMPT 225",
  title: "Data Structures",
  section: "D100 LEC",
  campus: "Burnaby",
  days: ["Mo"],
  startDate: "2026-09-01",
  endDate: "2026-12-10",
  start: 10 * 60,
  end: 11 * 60,
};

describe("class status", () => {
  it("uses Vancouver time even when UTC is already the next day", () => {
    expect(campusNow(new Date("2026-09-22T06:30:00Z"))).toMatchObject({ date: "2026-09-21", minutes: 23 * 60 + 30 });
  });

  it("shows a current class and the next later meeting", () => {
    const next = { ...monday, course: "MATH 232", start: 13 * 60, end: 14 * 60 };
    const status = classStatus([monday, next], new Date("2026-09-21T17:30:00Z"));
    expect(status.current.map((meeting) => meeting.course)).toEqual(["CMPT 225"]);
    expect(status.next?.course).toBe("MATH 232");
  });

  it("finds next week's class after today's meeting ends", () => {
    const status = classStatus([monday], new Date("2026-09-21T19:00:00Z"));
    expect(status.current).toEqual([]);
    expect(status.next?.date).toBe("2026-09-28");
  });

  it("ignores meetings before their first date and after their last date", () => {
    const expired = { ...monday, endDate: "2026-09-20" };
    expect(classStatus([expired], new Date("2026-09-21T17:30:00Z")).next).toBeNull();
    expect(classStatus([expired], new Date("2026-09-21T17:30:00Z")).current).toEqual([]);
  });
});
