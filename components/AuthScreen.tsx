import Link from "next/link";
import { SignInPanel } from "@/components/SignInPanel";
import { casEnabled } from "@/lib/cas";

/**
 * The sign-in and sign-up pages, which are the same page with two headings and
 * the two halves of SignInPanel.
 *
 * A page of its own rather than a section on the home page: signing in is the
 * one thing on this site you arrive already intending to do, and when it lived
 * under the demo it was three screens of scroll from the button that sent you
 * there. It also gives the act a URL — which is what lets the group page and
 * the profile page send you here and get you back afterwards.
 */
export function AuthScreen({
  mode,
  next,
  toggleNext = next,
  error = null,
}: {
  mode: "signin" | "register";
  /** Already passed through safeNext by the page above. */
  next: string;
  /**
   * Where the other half of the toggle should land, when that isn't the same
   * place. Sign-up sends new accounts via /courses, and someone clicking
   * "already have an account" is saying they aren't a new account — so the
   * link across carries the real destination rather than the detour.
   */
  toggleNext?: string;
  /** Something that went wrong before this page — today, only the SFU round trip. */
  error?: string | null;
}) {
  const register = mode === "register";
  // Carried across the toggle, so bouncing between the two doesn't lose where
  // you were headed.
  const query = toggleNext === "/" ? "" : `?next=${encodeURIComponent(toggleNext)}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 p-6 pb-20 sm:pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {register ? "Create an account" : "Sign in"}
        </h1>
        {/* Only on the way in for the first time. "Welcome back" said nothing
            the heading hadn't, and the first sentence of the sign-up line is
            the landing page's own pitch, one click later. */}
        {register && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Either door works, and the password one never talks to Google.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <SignInPanel
        initialMode={mode}
        next={next}
        // Read here rather than in the panel: the panel is a client component,
        // and whether CAS is configured is a server fact.
        sfu={casEnabled()}
        toggleHref={register ? `/signin${query}` : `/signup${query}`}
      />

      <Link
        href="/"
        className="text-sm text-neutral-500 underline-offset-2 hover:underline"
      >
        ← Back to meet.sfucourses.com
      </Link>
    </main>
  );
}
