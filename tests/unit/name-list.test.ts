import { describe, expect, it } from "vitest";
import { nameList, partialScheduleBanner } from "@/lib/name-list";

describe("nameList", () => {
  it("handles the empty and single cases", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Alex"])).toBe("Alex");
  });

  it("joins two with and, three-plus with an Oxford comma", () => {
    expect(nameList(["Alex", "Sam"])).toBe("Alex and Sam");
    expect(nameList(["Alex", "Sam", "Jordan"])).toBe("Alex, Sam, and Jordan");
  });
});

describe("partialScheduleBanner", () => {
  it("names who is still missing", () => {
    expect(partialScheduleBanner(3, 5, ["Alex", "Sam"])).toBe(
      "Showing overlap for 3 of 5 — Alex and Sam haven't added their schedule yet"
    );
    expect(partialScheduleBanner(4, 5, ["Alex"])).toBe(
      "Showing overlap for 4 of 5 — Alex hasn't added their schedule yet"
    );
  });

  it("stays quiet when there is nothing partial to report", () => {
    expect(partialScheduleBanner(5, 5, [])).toBeNull();
    expect(partialScheduleBanner(0, 5, ["Alex"])).toBeNull();
  });
});
