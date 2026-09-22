"use client";

import { useState, type RefObject } from "react";
import { calendarPngFilename } from "@/lib/calendar-image";

interface Props {
  groupCode: string;
  /** Null when you're not in this group: there's no schedule of yours to take. */
  memberId: number | null;
  /** The rendered week surface to clone at a shareable desktop width. */
  calendarRef: RefObject<HTMLDivElement | null>;
  groupName: string;
  week: string;
  view: "detailed" | "heat";
}

/**
 * Downloads either the viewer's recurring classes or the displayed group week.
 *
 * The calendar link stays browser-native because its route already responds as
 * an attachment. The PNG is made from an off-screen clone of the rendered grid,
 * which keeps the current member filters, attendance, week, and selected view.
 * Its export-only styles expand the mobile snap track into all five weekdays.
 */
export function CalendarTools({
  groupCode,
  memberId,
  calendarRef,
  groupName,
  week,
  view,
}: Props) {
  const [pngState, setPngState] = useState<"idle" | "saving" | "error">("idle");

  async function savePng() {
    const calendar = calendarRef.current;
    if (!calendar || pngState === "saving") return;

    setPngState("saving");
    let clone: HTMLDivElement | null = null;

    try {
      const { toBlob } = await import("html-to-image");
      await document.fonts.ready;

      clone = calendar.cloneNode(true) as HTMLDivElement;
      clone.classList.add("calendar-png-source");
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      document.body.append(clone);

      const backgroundColor = getComputedStyle(clone).backgroundColor;
      const blob = await toBlob(clone, {
        backgroundColor,
        cacheBust: true,
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        pixelRatio: 2,
        style: { position: "static", top: "auto", left: "auto" },
        filter: (node) =>
          !(node instanceof HTMLElement) || node.dataset.calendarExportIgnore !== "true",
      });
      if (!blob) throw new Error("The browser did not create an image.");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = calendarPngFilename(groupName, week, view);
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setPngState("idle");
    } catch (error) {
      console.error("Could not export the calendar as PNG", error);
      setPngState("error");
    } finally {
      clone?.remove();
    }
  }

  return (
    <>
      {memberId !== null && (
        <a
          href={`/api/groups/${groupCode}/members/${memberId}/calendar`}
          title="Download your classes this term as an .ics calendar file"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <CalendarIcon />
          Export Calendar
          <DownloadIcon />
        </a>
      )}
      <button
        type="button"
        onClick={savePng}
        disabled={pngState === "saving"}
        aria-label={pngState === "error" ? "PNG export failed. Try again" : undefined}
        title={
          pngState === "error"
            ? "Could not save the PNG. Try again."
            : "Download the displayed group calendar as a PNG image"
        }
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <ImageIcon />
        {pngState === "saving" ? "Saving PNG…" : pngState === "error" ? "Try PNG again" : "Export PNG"}
        {pngState === "saving" ? <SpinnerIcon /> : <DownloadIcon />}
      </button>
    </>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-500 dark:text-neutral-400">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-400 dark:text-neutral-500">
      <path d="M10 3v9m0 0l3.5-3.5M10 12L6.5 8.5" />
      <path d="M3.5 14.5v1a2 2 0 002 2h9a2 2 0 002-2v-1" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-500 dark:text-neutral-400">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M4.5 14l3.5-3 2.5 2 2.5-2.5 2.5 3.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 animate-spin text-neutral-400 dark:text-neutral-500">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M17 10a7 7 0 00-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
