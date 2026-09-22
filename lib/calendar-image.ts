/** Build a filesystem-safe name that still identifies the exported week and view. */
export function calendarPngFilename(
  groupName: string,
  week: string,
  view: "detailed" | "heat"
): string {
  const group = groupName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${group || "group"}-${week}-${view}.png`;
}
