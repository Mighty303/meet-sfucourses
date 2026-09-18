"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Invite link"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
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
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}
        </button>
        {isAdmin && !confirmRegen && (
          <button
            type="button"
            onClick={() => setConfirmRegen(true)}
            disabled={busy}
            aria-label="Regenerate invite link"
            title="Regenerate invite link"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <RegenerateIcon />
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
