"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Confirm, MemberRoster, type RosterMember } from "@/components/MemberRoster";
import { InviteLink } from "@/components/InviteLink";
import { GroupSettingsSkeleton } from "@/components/Skeleton";
import { forgetLastGroup } from "@/lib/last-group";
import { fromTermCode } from "@/lib/sfu";

interface Roster {
  group: {
    id: number;
    code: string;
    name: string;
    term: string;
    /** The group's admin, and the only person the buttons below appear for. */
    ownerUserId: number | null;
  };
  members: RosterMember[];
}

/**
 * Everything you do *to* a group rather than read from it: its name, its invite
 * link, who is in it, and the two ways out — leaving, and ending it.
 *
 * A page rather than the dropdown this replaces. That menu was four items wide
 * and had nowhere to grow: managing members needs a list, and a list does not
 * fit in a 16rem panel anchored to a button. A page also has a URL, so the
 * thing you were halfway through surviving a reload is the default rather than
 * something to arrange.
 *
 * It reads `?view=roster`, which is the group and its people without the term's
 * timetable — leaving a group must not depend on SFU having published one.
 */
export default function GroupSettingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [state, setState] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Null when nobody is renaming the group; the string being edited otherwise.
  const [draftName, setDraftName] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/groups/${code}?view=roster`);
    if (!res.ok) {
      setError(res.status === 404 ? "No group with that code." : "Could not load this group.");
      return;
    }
    setError(null);
    setState(await res.json());
  }, [code]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const signedIn = authStatus === "authenticated";
  const me = signedIn ? state?.members.find((m) => m.userId === session?.appUserId) ?? null : null;
  // The server checks this again on every write; here it only decides what is
  // worth showing somebody.
  const isAdmin =
    signedIn &&
    state?.group.ownerUserId != null &&
    state.group.ownerUserId === session?.appUserId;

  async function saveGroupName(e: React.FormEvent) {
    e.preventDefault();
    if (draftName === null || !draftName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draftName }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "could not rename this group");
      return;
    }
    setError(null);
    setDraftName(null);
    load();
  }

  async function leave() {
    if (!me) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${me.id}`, { method: "DELETE" });
    setSaving(false);
    setConfirmLeave(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "could not leave this group");
      return;
    }
    // The grid is still readable by anyone with the code, but it is no longer
    // yours, so this lands on the list of the ones that are.
    router.push("/");
  }

  async function deleteGroup() {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setConfirmDelete(false);
      setError((await res.json().catch(() => ({}))).error ?? "could not delete this group");
      return;
    }
    forgetLastGroup(code);
    router.push("/");
  }

  if (error && !state) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-5 sm:p-8">
        <p className="text-sm text-amber-600">{error}</p>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Home
        </Link>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5 sm:p-8">
        <GroupSettingsSkeleton />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-col gap-2">
        {/* Back to the week, which is what this group is for — the settings are
            a detour, so the way out of them is the first thing on the page. */}
        <Link
          href={`/g/${code}`}
          className="w-fit text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← {state.group.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Group settings</h1>
        <p className="text-sm text-neutral-500">
          {fromTermCode(state.group.term)} · code{" "}
          <span className="font-mono">{state.group.code}</span>
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-medium">Name</h2>
          <p className="text-xs text-neutral-500">
            {isAdmin ? "Everyone in the group sees it." : "Only the admin can change it."}
          </p>
        </div>
        {draftName !== null ? (
          <form onSubmit={saveGroupName} className="flex flex-wrap items-center gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              maxLength={120}
              onKeyDown={(e) => { if (e.key === "Escape") setDraftName(null); }}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              disabled={saving || !draftName.trim()}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              Save
            </button>
            <button type="button" onClick={() => setDraftName(null)} className="text-sm text-neutral-500">
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg">{state.group.name}</span>
            {/* The same pencil the roster puts on a member row — renaming is
                renaming, whether the name belongs to a person or a group. */}
            {isAdmin && (
              <button
                onClick={() => setDraftName(state.group.name)}
                aria-label="Rename group"
                title="Rename group"
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-medium">Invite</h2>
          <p className="text-xs text-neutral-500">
            Anyone with this link can open the group and join it.
          </p>
        </div>
        <InviteLink
          code={code}
          isAdmin={isAdmin === true}
          afterPath={(next) => `/g/${next}/settings`}
        />
      </section>

      <section>
        <MemberRoster
          code={code}
          groupName={state.group.name}
          members={state.members}
          ownerUserId={state.group.ownerUserId}
          myMemberId={me?.id ?? null}
          canManage={isAdmin === true}
          onChanged={load}
        />
      </section>

      {(me || isAdmin) && (
        <section className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="font-medium">Danger Zone</h2>

          {/* One way out each, and never both. A member leaves. The admin
              ends the group, or hands it to somebody in the roster above and
              leaves as an ordinary member afterwards — an admin who could
              simply walk out would be passing the group to whoever joined
              earliest without ever being asked. */}
          {me && !isAdmin && (
            confirmLeave ? (
              <Confirm
                question={`Leave ${state.group.name}? Your sections come off this grid.`}
                action="Leave"
                pending="Leaving…"
                busy={saving}
                onConfirm={leave}
                onCancel={() => setConfirmLeave(false)}
              />
            ) : (
              <button
                onClick={() => { setConfirmDelete(false); setConfirmLeave(true); }}
                disabled={saving}
                className="flex w-fit items-center gap-2 rounded-lg border border-red-600 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
              >
                <LeaveIcon />
                Leave group
              </button>
            )
          )}

          {isAdmin && (
            confirmDelete ? (
              <Confirm
                question={`Delete ${state.group.name} and everyone's schedules in it?`}
                action="Delete for everyone"
                pending="Deleting…"
                busy={saving}
                onConfirm={deleteGroup}
                onCancel={() => setConfirmDelete(false)}
              />
            ) : (
              <button
                onClick={() => { setConfirmLeave(false); setConfirmDelete(true); }}
                disabled={saving}
                className="flex w-fit items-center gap-2 rounded-lg border border-red-600 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
              >
                <TrashIcon />
                Delete group
              </button>
            )
          )}
          {isAdmin && (
            <p className="text-xs text-neutral-500">
              Deleting takes everyone&apos;s schedules in this group with it. To
              leave without ending it, make somebody else the admin above first.
            </p>
          )}
        </section>
      )}

      {error && <p className="text-sm text-amber-600">{error}</p>}
    </main>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
    </svg>
  );
}

/** The two icons that came off the ⋮ with the actions they belong to. */
function LeaveIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {/* Door, then an arrow stepping out of it. */}
      <path d="M11.5 3.25h4.25v13.5H11.5" />
      <path d="M8.75 10h-6" />
      <path d="M5.5 7l-2.75 3 2.75 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M3.5 6h13" />
      <path d="M8 3.5h4" />
      <path d="M5.25 6l.75 10.25h8l.75-10.25" />
      <path d="M8.5 9v4.75M11.5 9v4.75" />
    </svg>
  );
}
