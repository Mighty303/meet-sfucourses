"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { currentTermCode, fromTermCode, termOptions } from "@/lib/sfu";

/**
 * Starting a group and joining one by code — the two things both halves of the
 * home page end with, whether you've just arrived or you're signed in and
 * looking at a list of groups you're already in.
 *
 * Two buttons, not two forms. They used to be open on the page: a name field, a
 * term dropdown and a submit, then a code field and a Go, stacked under a demo
 * and an account card. That is four controls and two headings in front of
 * someone who has not yet decided they want any of this, and the term dropdown
 * in particular is a question nobody has before they have answered the first
 * one. Pressing the button is the answer; the modal is where the typing goes.
 *
 * Creating works signed out: the group is simply left without an admin until
 * the first person joins and adopts it.
 */
export function GroupActions({ startDelay = 0 }: { startDelay?: number }) {
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  return (
    <div
      className="fade-up mx-auto flex w-full max-w-lg flex-wrap items-center justify-center gap-x-5 gap-y-3"
      style={{ animationDelay: `${startDelay}ms` }}
    >
      {/* One loud thing on the page. Joining by code is the rarer half — you
          only do it holding a code someone sent you — so it is a link, which
          is also what keeps this from being the double CTA it replaced. */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
      >
        Create a group
      </button>
      <button
        type="button"
        onClick={() => setJoining(true)}
        className="text-sm text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
      >
        or join with a code
      </button>

      {/* Each body is its own component, so Modal unmounting it on close is
          what clears the fields — no reset to remember to write. */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Create a group">
        <CreateGroupForm />
      </Modal>
      <Modal open={joining} onClose={() => setJoining(false)} title="Join with a code">
        <JoinCodeForm />
      </Modal>
    </div>
  );
}

function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [term, setTerm] = useState(currentTermCode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, term }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "could not create group");
      setBusy(false);
      return;
    }
    const group = await res.json();
    router.push(`/g/${group.code}`);
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-4 px-5 py-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name it
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CMPT study crew"
          required
          autoFocus
          maxLength={120}
          className="rounded-lg border border-neutral-300 px-3 py-2 font-normal dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {/* Still a dropdown, but one nobody has to look at: it opens on the term
          that is running, which is the answer almost every time. */}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Term
        <select
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 font-normal dark:border-neutral-700 dark:bg-neutral-900"
        >
          {termOptions().map((t) => (
            <option key={t} value={t}>{fromTermCode(t)}</option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Creating…" : "Create group"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/g/${code.trim().toUpperCase()}`);
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Group code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC1234"
          autoFocus
          className="rounded-lg border border-neutral-300 px-3 py-2 font-mono uppercase dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-xs font-normal text-neutral-500">
          It&apos;s the last part of the link whoever invited you sent.
        </span>
      </label>
      <button
        type="submit"
        disabled={!code.trim()}
        className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        Open group
      </button>
    </form>
  );
}
