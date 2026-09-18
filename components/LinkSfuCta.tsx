"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import type { LinkSfuOffer } from "@/lib/link-sfu-offer";

/** Same crimson + mark as SignInPanel's SFU door, sized for the profile card. */
const SFU_BUTTON =
  "flex items-center justify-center gap-1.5 rounded-lg bg-[#a6192e] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";


/**
 * Profile copy for attaching an SFU Computing ID (or the generic fold blurb
 * when CAS is off). Visibility is decided by `linkSfuOffer` so the page and
 * the unit tests share one rule.
 *
 * The link button starts the challenge and sends them straight to CAS — no
 * intermediate /profile/link explainer. They only see that page afterwards,
 * when both halves are proved and the confirm screen has something to say.
 */
export function LinkSfuCta({ offer }: { offer: LinkSfuOffer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function linkSfu() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/link/start", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError("could not start that. Try again.");
      return;
    }
    // Challenge cookie survives sign-out. Land back on /profile/link after CAS
    // so the confirm screen can show what would move.
    await signOut({
      callbackUrl: `/api/auth/sfu/start?next=${encodeURIComponent("/profile/link")}`,
    });
  }

  if (offer === "link") {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign in with your SFU ID and keep the groups on this account.
        </p>
        <button type="button" onClick={linkSfu} disabled={busy} className={`self-start ${SFU_BUTTON}`}>
          <SfuMark />
          {busy ? "Starting…" : "Link your SFU ID"}
        </button>
        {error && <p className="text-xs text-amber-600">{error}</p>}
      </div>
    );
  }
  if (offer === "linked") {
    return <p className="mt-2 text-xs text-neutral-500">SFU ID linked.</p>;
  }
  if (offer === "fold") {
    return (
      <p className="mt-2 text-xs text-neutral-500">
        Signed in here another way before?{" "}
        <Link
          href="/profile/link"
          className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Fold your accounts into one
        </Link>
        .
      </p>
    );
  }
  return null;
}

/** SFU's own red mark — same glyph as the sign-in panel, not an official logo. */
function SfuMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 1.5 16 5v8L9 16.5 2 13V5l7-3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
