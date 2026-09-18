"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Confirm } from "@/components/MemberRoster";
import { copyText } from "@/lib/copy-text";
import { forgetLastGroup, rememberLastGroup } from "@/lib/last-group";

/**
 * The group's invite URL, always on screen the way settings shows it — plus
 * copy, and for the admin a rotate control when a link got out.
 *
 * Shared by the group page and settings so the two places cannot drift: one
 * always-visible field, one copy button, one regenerate icon.
 */
export function InviteLink({
  code,
  isAdmin,
  /**
   * Where to land after a successful rotate. The group page stays on the week;
   * settings stays in settings. Both rewrite the code in the path.
   */
  afterPath = (next: string) => `/g/${next}`,
}: {
  code: string;
  isAdmin: boolean;
  afterPath?: (nextCode: string) => string;
}) {
  const router = useRouter();
  const regenerateTooltipId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/g/${code}` : "";

  async function regenerate() {
    setBusy(true);
    const res = await fetch(`/api/groups/${code}/code`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setConfirmRegen(false);
      setError(
        (await res.json().catch(() => ({}))).error ?? "could not regenerate the invite link"
      );
      return;
    }
    const { code: nextCode } = (await res.json()) as { code: string };
    setConfirmRegen(false);
    setError(null);
    forgetLastGroup(code);
    rememberLastGroup(nextCode);
    router.replace(afterPath(nextCode));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Invite link"
          className="w-64 max-w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 sm:w-96 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        />
        <button
          type="button"
          onClick={() => {
            void copyText(shareUrl).then((ok) => {
              if (!ok) {
                setCopyState("failed");
                return;
              }
              setCopyState("copied");
              setTimeout(() => setCopyState("idle"), 2000);
            });
          }}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <CopyIcon done={copyState === "copied"} />
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}
        </button>
        {isAdmin && !confirmRegen && (
          <button
            type="button"
            onClick={() => setConfirmRegen(true)}
            disabled={busy}
            aria-label="Regenerate invite link"
            aria-describedby={regenerateTooltipId}
            className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <RegenerateIcon />
            <span
              id={regenerateTooltipId}
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-neutral-100 dark:text-neutral-900"
            >
              Regenerate invite link
            </span>
          </button>
        )}
      </div>
      {isAdmin && confirmRegen && (
        <Confirm
          question="Regenerate the invite link? The current one stops working."
          action="Regenerate"
          pending="Regenerating…"
          busy={busy}
          onConfirm={regenerate}
          onCancel={() => setConfirmRegen(false)}
        />
      )}
      {error && <p className="text-sm text-amber-600">{error}</p>}
    </div>
  );
}

/** Clipboard by default; a check once the copy landed. */
function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-neutral-500 dark:text-neutral-400"
    >
      {done ? (
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
      ) : (
        <>
          <rect x="7.25" y="7.25" width="9" height="9" rx="2" />
          <path d="M12.75 4.75a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2" />
        </>
      )}
    </svg>
  );
}

/** Two arrows chasing each other — mint a new code, retire the old one. */
function RegenerateIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 0 0-14.66-6.95L4 7" />
      <path d="M4 3v4h4" />
      <path d="M3 12a9 9 0 0 0 14.66 6.95L20 17" />
      <path d="M20 21v-4h-4" />
    </svg>
  );
}
