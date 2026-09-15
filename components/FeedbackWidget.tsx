"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { MESSAGE_MAX } from "@/lib/feedback-limits";

/**
 * The "tell me what's wrong" button, parked in the bottom-right corner of every
 * page. Messages land in the admin portal.
 *
 * The dialog itself is components/Modal.tsx — see there for why it's a real
 * <dialog>. The green is this widget's own: it is the one control on the site
 * that isn't about a schedule, and looking like the rest of the furniture is
 * how a feedback button goes unpressed.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // The portal is where feedback is read, so offering to send some from there
  // is just a button in the way of the tables.
  const hidden = pathname.startsWith("/admin");

  // Close on its own once the thanks has been read, rather than leaving a dead
  // dialog for the person to dismiss.
  useEffect(() => {
    if (state !== "sent") return;
    const timer = setTimeout(() => setOpen(false), 1600);
    return () => clearTimeout(timer);
  }, [state]);

  if (hidden) return null;

  const signedInAs = session?.user?.email ?? null;

  function reset() {
    setOpen(false);
    setMessage("");
    setEmail("");
    setState("idle");
    setError(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || state === "sending") return;

    setState("sending");
    setError(null);

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The path, not the full URL: a group code in the query string is enough
      // to find the page again, and the rest is noise in the portal.
      body: JSON.stringify({ message, email, path: pathname }),
    }).catch(() => null);

    if (!res?.ok) {
      const reason = res ? (await res.json().catch(() => ({}))).error : null;
      setError(reason ?? "could not send that, try again in a moment");
      setState("idle");
      return;
    }

    setState("sent");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
        // Above the page but below the dialog, which sits in the top layer and
        // is out of z-index's reach entirely. The bottom inset clears iOS's
        // home indicator on the group page, where the grid scrolls under it.
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#24a98b] text-white shadow-lg transition-[transform,background-color] hover:scale-105 hover:bg-[#177058] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24a98b]"
      >
        <ChatIcon />
      </button>

      <Modal open={open} onClose={reset} title="Send feedback" titleClassName="text-[#24a98b]">
        {state === "sent" ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-600 dark:text-neutral-300">
            Thanks, that landed.
          </p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4 px-5 py-5">
            {signedInAs ? (
              // Signed in, so the account is already on the row and the portal
              // shows who sent it. Asking for the address again would be a
              // field whose only possible answer we already have.
              <p className="text-sm text-neutral-500">
                Sending as <span className="text-neutral-700 dark:text-neutral-300">{signedInAs}</span>
              </p>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Email (optional)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="rounded-lg border border-neutral-300 px-3 py-2 font-normal dark:border-neutral-700 dark:bg-neutral-900"
                />
                <span className="text-xs font-normal text-neutral-500">
                  Only so I can reply. Leave it blank to stay anonymous.
                </span>
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                maxLength={MESSAGE_MAX}
                autoFocus
                placeholder="What's broken, what's missing, what you'd want instead"
                className="resize-y rounded-lg border border-neutral-300 px-3 py-2 font-normal dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>

            <button
              type="submit"
              disabled={!message.trim() || state === "sending"}
              // Darkens rather than fades on hover: the disabled state is already an
              // opacity change, and two meanings on one property read as the same
              // thing happening twice.
              className="rounded-lg bg-[#24a98b] px-3 py-2 font-medium text-white transition-colors hover:bg-[#177058] disabled:opacity-50 disabled:hover:bg-[#24a98b]"
            >
              {state === "sending" ? "Sending…" : "Send feedback"}
            </button>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 12.5a2 2 0 01-2 2H7l-4 3v-12a2 2 0 012-2h10a2 2 0 012 2z" />
      <path d="M10 6v3.5M10 12h.01" />
    </svg>
  );
}
