// The heat map's colour ramp, kept out of the component so it can be read —
// and tested — without pulling React in. HeatGrid is the only renderer; this is
// the whole of what it decides about intensity.

// Emerald, matching the "everyone free" green the detailed grid already uses.
export const FILL = [16, 185, 129] as const;

/**
 * Stripes for the bands where someone is in class on campus.
 *
 * A hatch rather than a second fill colour: the emerald ramp is the whole
 * reading of this view, and a solid grey heavy enough to notice would compete
 * with the pale end of it. A neutral at this alpha sits under both themes
 * without being told which one it's in.
 */
export const IN_CLASS_HATCH =
  "repeating-linear-gradient(45deg, transparent 0 5px, rgba(128,128,128,0.16) 5px 10px)";

/**
 * The same idea as IN_CLASS_HATCH, for a class attended from home. Blue rather
 * than grey so an all-online hour doesn't read as the same "in a room" state
 * the detailed grid marks with a white corner dot.
 */
export const ONLINE_HATCH =
  "repeating-linear-gradient(-45deg, transparent 0 5px, rgba(59,130,246,0.22) 5px 10px)";

/**
 * Alpha for `n of total` free. Zero is left transparent so the column's own
 * background shows through — an empty band should read as the paper, not as a
 * very pale green. The floor at 0.12 keeps one person out of eight visible.
 */
export function fillAlpha(free: number, total: number): number {
  if (free === 0 || total === 0) return 0;
  return 0.12 + 0.73 * (free / total);
}
