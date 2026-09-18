"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";

interface Account {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  createdAt: string;
  doors: { google: boolean; password: boolean; sfu: boolean };
  groups: number;
  terms: number;
}

interface Preview {
  pending: boolean;
  survivor?: Account;
  absorbed?: Account;
  sharedGroups?: { code: string; name: string }[];
  error?: string;
}

const REFUSALS: Record<string, string> = {
  "same-account":
    "You're still signed in as the same account. Sign out, sign in as the other one, then come back here.",
  "two-sfu-accounts":
    "Those are two different SFU computing IDs. Only one person's own accounts can be folded together.",
  "missing-account": "One of those accounts no longer exists.",
};

function doorList(a: Account): string {
  const names = [
    a.doors.google && "Google",
    a.doors.password && "a password",
    a.doors.sfu && "your SFU ID",
  ].filter(Boolean) as string[];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "nothing";
}

/**
 * The confirm screen, and the one page that ever says what a merge will do.
 *
 * Two jobs, and which one it does depends on whether a link is half-finished.
 * With no challenge in flight it explains the offer and starts one. With both
 * halves proved it shows the two accounts and what folding them costs, because
 * a duplicate member row's name, colour and busy blocks are the one thing that
 * does not survive and nobody should meet that afterwards.
 */
function LinkBody() {
  const { status: authStatus } = useSession();
  const found = useSearchParams().get("found");
  const intent = useSearchParams().get("intent");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/link/preview");
    if (!res.ok) return;
    setPreview(await res.json());
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (authStatus === "authenticated") load(); }, [authStatus, load]);

  /** Park the challenge, then go and sign in as the other account. */
  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/link/start", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError("could not start that. Try again.");
      return;
    }
    // Signed out first, because /signin redirects anyone who still holds a
    // session. The challenge cookie is untouched by this and is what carries
    // the first half of the proof across. Intent=sfu skips the sign-in picker
    // and sends them straight to CAS — the door they asked to add.
    const back = intent === "sfu" ? "/profile/link?intent=sfu" : "/profile/link";
    const after =
      intent === "sfu"
        ? `/api/auth/sfu/start?next=${encodeURIComponent(back)}`
        : `/signin?next=${encodeURIComponent(back)}`;
    await signOut({ callbackUrl: after });
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/link/confirm", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "could not fold those together");
      return;
    }
    setDone(body.account?.email ?? null);
  }

  if (authStatus === "loading") return null;
  if (authStatus !== "authenticated") {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/signin?next=%2Fprofile%2Flink" className="text-blue-600 hover:underline dark:text-blue-400">
          Sign in
        </Link>{" "}
        to link your accounts.
      </p>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-emerald-600">
          Done. Everything is on {done}, and every sign-in you had still opens it.
        </p>
        <Link href="/profile" className="self-start text-sm text-blue-600 hover:underline dark:text-blue-400">
          Back to your profile
        </Link>
      </div>
    );
  }

  const plan =
    preview?.pending && preview.survivor && preview.absorbed
      ? {
          survivor: preview.survivor,
          absorbed: preview.absorbed,
          sharedGroups: preview.sharedGroups ?? [],
        }
      : null;

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        {preview?.error && (
          <p className="text-sm text-amber-600">{REFUSALS[preview.error] ?? preview.error}</p>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {found === "google"
            ? "There's already an account here under your @sfu.ca address, signed in with Google. It's probably yours — it has your groups and your timetable on it."
            : intent === "sfu"
              ? "Sign in with your SFU ID to fold it into this account. Your groups stay; afterwards either sign-in opens them, and the account wears your @sfu.ca address."
              : "If you've signed in here another way before — with Google, with a password, or with your SFU ID — that's a separate account with its own groups and timetable. This folds them into one."}
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Nothing happens on an address alone. You&apos;ll be signed out, sign in as
          the other account, and come back here to see exactly what would move
          before anything does.
        </p>
        <button
          onClick={start}
          disabled={busy}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Starting…" : intent === "sfu" ? "Continue with your SFU ID" : "Sign in as the other account"}
        </button>
        {error && <p className="text-sm text-amber-600">{error}</p>}
      </div>
    );
  }

  const { survivor, absorbed, sharedGroups } = plan;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Both accounts are proved. Everything on the second moves to the first,
        and every way of signing in keeps working afterwards.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { a: survivor, label: "Keeps your stuff" },
          { a: absorbed, label: "Folds into it" },
        ].map(({ a, label }) => (
          <article
            key={a.id}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
            <div className="flex items-center gap-3">
              <Avatar src={a.avatar} name={a.name ?? a.email} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.name ?? a.email}</p>
                <p className="truncate text-xs text-neutral-500">{a.email}</p>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Opens with {doorList(a)} · {a.groups} group{a.groups === 1 ? "" : "s"} ·{" "}
              {a.terms} term{a.terms === 1 ? "" : "s"} of courses
            </p>
          </article>
        ))}
      </div>

      {sharedGroups.length > 0 && (
        <div className="rounded-lg border border-amber-300 p-4 text-sm dark:border-amber-900">
          <p className="font-medium text-amber-700 dark:text-amber-500">
            You&apos;re in {sharedGroups.length === 1 ? "one group" : `${sharedGroups.length} groups`} twice
          </p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            In {sharedGroups.map((g) => g.name).join(", ")} only one of you can
            stay. The name, colour and any busy blocks on the other one are
            dropped — your courses and skipped classes are kept either way.
          </p>
        </div>
      )}

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        This can&apos;t be undone. You can remove a sign-in afterwards, but the
        two timetables stay folded together.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={confirm}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Folding…" : "Fold them together"}
        </button>
        <Link href="/profile" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
          Not now
        </Link>
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}
    </div>
  );
}

export default function LinkAccountsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">One account, several sign-ins</h1>
        <Link
          href="/profile"
          className="self-start text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          ← Back to your profile
        </Link>
      </header>
      <Suspense fallback={null}>
        <LinkBody />
      </Suspense>
    </main>
  );
}
