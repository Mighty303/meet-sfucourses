"use client";

import { useEffect, useRef } from "react";

/**
 * The one dialog in the app.
 *
 * A real <dialog> rather than a div with a high z-index: the browser then owns
 * the focus trap, the Escape key, the inert background and the top layer, all
 * of which this would otherwise have to reimplement — and the top layer is the
 * part that matters, because the group page is a grid of absolutely positioned
 * blocks that a hand-rolled overlay has to out-stack one by one.
 *
 * Controlled by `open` rather than by a ref the caller pokes. Four things now
 * open a modal — feedback, create a group, join by code, and the account gate
 * — and three of them are opened by a button that lives somewhere else on the
 * page, which is exactly the case an imperative handle makes awkward.
 *
 * `onClose` fires for every way out there is, including the two the browser
 * provides for free, so the caller only has to set its flag back.
 */
export function Modal({
  open,
  onClose,
  title,
  titleClassName = "",
  width = "26rem",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** For a modal whose heading is coloured — the feedback widget's is. */
  titleClassName?: string;
  /** The card's ceiling; it still shrinks to the viewport below that. */
  width?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // The dialog element fills the viewport; its box is the backdrop as
        // far as clicks are concerned, so a hit on it and not on the card
        // inside means the person clicked outside to dismiss.
        if (e.target === ref.current) ref.current?.close();
      }}
      // Tailwind's preflight zeroes every margin, which takes the centring a
      // modal dialog would otherwise do for itself, so it goes back by hand.
      style={{ width: `min(92vw, ${width})` }}
      className="m-auto rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-black/50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <h2 className={`text-lg font-semibold tracking-tight ${titleClassName}`}>
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <CloseIcon />
        </button>
      </div>
      {/* Mounted only while open, so every modal starts on a blank form and a
          half-typed one can't be left behind the backdrop. */}
      {open && children}
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
