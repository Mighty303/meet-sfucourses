// The committed slice of a real term dump, typed. Regenerate with
// `npm run test:fixture` — see refresh.ts for what the 15 courses are chosen to
// cover. It is real upstream data, so it keeps the parsers honest about the
// shapes SFU actually publishes (empty campus strings, async sections with no
// days, sections meeting three times a week) without touching the network.

import raw from "./term-sample.json" with { type: "json" };
import { indexByClassNumber, type CourseWithSections } from "@/lib/sfu";

export const TERM_SAMPLE = raw as CourseWithSections[];

/** The term the sample was pulled from — what its startDate/endDate refer to. */
export const SAMPLE_TERM = "2026-fall";

export const SAMPLE_INDEX = indexByClassNumber(TERM_SAMPLE);

/** First section that actually meets somewhere at some time. */
export function aScheduledSection() {
  for (const [classNumber, hit] of SAMPLE_INDEX) {
    if (hit.section.schedules.some((s) => s.days.trim() && s.startTime && s.campus.trim())) {
      return { classNumber, ...hit };
    }
  }
  throw new Error("fixture has no scheduled section — regenerate it");
}
