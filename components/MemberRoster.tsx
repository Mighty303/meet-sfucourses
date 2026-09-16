"use client";

import Image from "next/image";
import { useState } from "react";

export interface RosterMember {
  id: number;
  displayName: string;
  color: string;
  userId: number | null;
  image: string | null;
  sfuVerified: boolean;
}

/**
 * Everyone in the group, and — for its admin — what can be done to them:
 * rename, hand the group over, remove.
 *
 * Read-only for everyone else rather than hidden from them. A member opening
 * the settings page has a fair question ("who is in this?") and the answer is
 * the same list; only the buttons are the admin's.
 *
 * Every action reloads through `onChanged` instead of patching a local copy:
 * removing a member moves the admin badge, because the server hands the group
 * on, and a roster that disagreed with itself would be worse than a blink.
 */
export function MemberRoster({
  code,
  groupName,
  members,
  ownerUserId,
  myMemberId,
  canManage,
  onChanged,
}: {
  code: string;
  groupName: string;
  members: RosterMember[];
  ownerUserId: number | null;
  /** Your own row, which gets "you" and no remove button — leaving is its own. */
  myMemberId: number | null;
  canManage: boolean;
  onChanged: () => void;
}) {
  // The row being renamed and what has been typed into it, so "" is a real
  // state rather than "nobody is editing".
  const [draft, setDraft] = useState<{ id: number; value: string } | null>(null);
  // Both of these take something away — a place in the group, or your own
  // admin — so each arms in place rather than acting on the first press.
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [confirmAdmin, setConfirmAdmin] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDraft(null);
    setConfirmRemove(null);
    setConfirmAdmin(null);
  }

  async function send(url: string, init: RequestInit, fallback: string) {
    setBusy(true);
    const res = await fetch(url, init);
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? fallback);
      return;
    }
    setError(null);
    reset();
    onChanged();
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.value.trim()) return;
    await send(
      `/api/groups/${code}/members/${draft.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: draft.value }),
      },
      "could not rename them"
    );
  }

  async function remove(id: number) {
    await send(`/api/groups/${code}/members/${id}`, { method: "DELETE" }, "could not remove them");
  }

  async function makeAdmin(id: number) {
    await send(
      `/api/groups/${code}/owner`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: id }),
      },
      "could not hand the group over"
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-medium">Members</h2>
        <p className="text-xs text-neutral-500">
          {canManage
            ? "Renaming somebody changes the name everyone here sees. Removing them takes their schedule off this grid, not off their account."
            : `${members.length} ${members.length === 1 ? "person" : "people"} in ${groupName}.`}
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {members.map((m) => {
          const isOwner = m.userId !== null && m.userId === ownerUserId;
          const isMe = m.id === myMemberId;
          return (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-800"
            >
              <div className="flex items-center gap-2">
                {m.image ? (
                  <Image src={m.image} alt="" width={18} height={18} className="shrink-0 rounded-full" />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: m.color }} />
                )}

                {draft?.id === m.id ? (
                  <form onSubmit={rename} className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      value={draft.value}
                      onChange={(e) => setDraft({ id: m.id, value: e.target.value })}
                      autoFocus
                      maxLength={60}
                      onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); }}
                      className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                    <button
                      type="submit"
                      disabled={busy || !draft.value.trim()}
                      className="shrink-0 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="shrink-0 text-xs text-neutral-500"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="truncate text-sm font-medium" style={{ color: m.color }}>
                      {m.displayName}
                    </span>
                    {m.sfuVerified && (
                      /* The same narrow claim the member list makes: CAS let
                         them in, so they're at SFU. Never which computing ID. */
                      <span
                        title="Signed in with an SFU computing ID"
                        aria-label="SFU verified"
                        className="shrink-0 text-xs leading-none text-[#a6192e] dark:text-red-400"
                      >
                        ✓
                      </span>
                    )}
                    {isMe && <span className="shrink-0 text-xs text-neutral-500">you</span>}
                    {isOwner && (
                      <span className="shrink-0 rounded border border-neutral-300 px-1 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                        Admin
                      </span>
                    )}

                    {canManage && (
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <IconButton
                          label={`Rename ${m.displayName}`}
                          onClick={() => { reset(); setDraft({ id: m.id, value: m.displayName }); }}
                          disabled={busy}
                        >
                          <PencilIcon />
                        </IconButton>
                        {/* An ownerless row has no account to hand a group to,
                            and there is nothing to hand yourself. */}
                        {!isOwner && m.userId !== null && (
                          <IconButton
                            label={`Make ${m.displayName} the admin`}
                            onClick={() => { reset(); setConfirmAdmin(m.id); }}
                            disabled={busy}
                          >
                            <CrownIcon />
                          </IconButton>
                        )}
                        {!isMe && (
                          <IconButton
                            label={`Remove ${m.displayName}`}
                            danger
                            onClick={() => { reset(); setConfirmRemove(m.id); }}
                            disabled={busy}
                          >
                            <RemoveIcon />
                          </IconButton>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {confirmRemove === m.id && (
                <Confirm
                  question={`Remove ${m.displayName} from ${groupName}?`}
                  action="Remove"
                  pending="Removing…"
                  busy={busy}
                  onConfirm={() => remove(m.id)}
                  onCancel={() => setConfirmRemove(null)}
                />
              )}
              {confirmAdmin === m.id && (
                <Confirm
                  question={`Make ${m.displayName} the admin? You stop being it.`}
                  action="Hand it over"
                  pending="Handing over…"
                  busy={busy}
                  onConfirm={() => makeAdmin(m.id)}
                  onCancel={() => setConfirmAdmin(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Armed in place: the second press is worded differently, and that is the whole
    of the confirmation. Shared by every irreversible thing on this page. */
export function Confirm({
  question,
  action,
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  action: string;
  pending: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
      <span className="text-neutral-600 dark:text-neutral-300">{question}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="rounded-md bg-red-600 px-2 py-1 font-medium text-white disabled:opacity-50"
        >
          {busy ? pending : action}
        </button>
        <button onClick={onCancel} className="text-neutral-500">
          Cancel
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors disabled:opacity-40 ${
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          : "hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6l3.5 3L10 4l3.5 5L17 6l-1.5 9h-11z" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
