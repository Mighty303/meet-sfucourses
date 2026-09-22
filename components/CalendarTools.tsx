"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
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
 * Exports either the viewer's recurring classes or the displayed group week.
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
  const [pngAction, setPngAction] = useState<"download" | "copy" | null>(null);
  const [pngError, setPngError] = useState<"download" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function renderPng(): Promise<Blob> {
    const calendar = calendarRef.current;
    if (!calendar) throw new Error("The calendar is not ready to export.");

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
      return blob;
    } finally {
      clone?.remove();
    }
  }

  async function exportPng(action: "download" | "copy") {
    if (pngAction) return;
    setMenuOpen(false);
    setPngError(null);
    setPngAction(action);

    try {
      if (action === "copy") {
        const blob = renderPng();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const blob = await renderPng();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = calendarPngFilename(groupName, week, view);
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (error) {
      console.error(`Could not ${action} the calendar PNG`, error);
      setPngError(action);
      setMenuOpen(true);
    } finally {
      setPngAction(null);
    }
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={pngAction !== null}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-live="polite"
        title={
          pngError
            ? `PNG ${pngError} failed. Open to try again.`
            : "Export this calendar"
        }
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {copied ? <CheckIcon /> : <DownloadIcon />}
        {pngAction === "download"
          ? "Saving PNG…"
          : pngAction === "copy"
            ? "Copying PNG…"
            : copied
              ? "Copied!"
              : "Export"}
        {pngAction ? <SpinnerIcon /> : <ChevronIcon open={menuOpen} />}
      </button>

      {menuOpen && (
        <div
          id={menuId}
          role="group"
          aria-label="Export options"
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {memberId !== null && (
            <a
              href={`/api/groups/${groupCode}/members/${memberId}/calendar`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <CalendarIcon />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Calendar file</span>
                <span className="text-xs text-neutral-500">.ics · your classes this term</span>
              </span>
              <DownloadIcon />
            </a>
          )}
          <button
            type="button"
            onClick={() => exportPng("download")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ImageIcon />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {pngError === "download" ? "Try PNG download again" : "PNG image"}
              </span>
              <span className="text-xs text-neutral-500">Displayed group week</span>
            </span>
            <DownloadIcon />
          </button>
          <button
            type="button"
            onClick={() => exportPng("copy")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <CopyIcon />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {pngError === "copy" ? "Try copying PNG again" : "Copy PNG"}
              </span>
              <span className="text-xs text-neutral-500">Displayed group week</span>
            </span>
          </button>
        </div>
      )}
    </div>
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-500 dark:text-neutral-400">
      <rect x="6" y="6" width="10.5" height="10.5" rx="2" />
      <path d="M13.5 6V5.5a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2H6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-emerald-600 dark:text-emerald-400">
      <path d="M4 10.5l4 4L16 6" />
    </svg>
  );
}
