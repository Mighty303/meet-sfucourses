"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Avatar } from "./Avatar";

interface Props {
  /**
   * The mobile menu, where the row has the whole panel width to itself, so the
   * account block is styled as menu rows rather than as the compact desktop
   * control. It also has its own Profile row, so the picture stays out of it.
   */
  stacked?: boolean;
  /** Where the picture-and-name chip goes. Built by the nav, which knows the path. */
  profileHref?: string;
  profileActive?: boolean;
}

/**
 * Who you're signed in as, and the way out.
 *
 * Signed in, the picture and the name are the Profile link rather than a label
 * sitting next to one: a nav that listed "Profile" *and* showed your face two
 * items later was naming the same destination twice, and the face is the half
 * people aim at. That leaves one account control at the end of the bar instead
 * of a link at one end and an avatar at the other.
 */
export function AuthButton({ stacked = false, profileHref = "/profile", profileActive = false }: Props) {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />;
  }

  // Signed out these are signposts rather than the act itself — both providers
  // live on /signin and /signup, and a corner button could only ever offer one
  // of them. Two links rather than one because "Sign in" alone reads as a door
  // for people who already have a key, and the app is new enough that almost
  // nobody does.
  //
  // Small enough to sit in the bar at any width, which is why the navigation
  // has no hamburger until you're signed in.
  if (!session?.user) {
    return (
      <>
        <Link
          href="/signin"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          Sign up
        </Link>
      </>
    );
  }

  const name = session.user.name ?? session.user.email ?? "";

  if (stacked) {
    // In the mobile menu this is just one more menu row. Who you're signed
    // in as belongs on the Profile page the menu already links to, so the
    // avatar and name would only repeat it. Sign out isn't destructive —
    // neutral until hover, and behind a divider so it isn't hit by accident.
    return (
      <button
        onClick={() => signOut()}
        className="w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-red-400"
      >
        Sign out
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={profileHref}
        aria-current={profileActive ? "page" : undefined}
        className={`flex items-center gap-2 rounded-lg py-1 pr-3 pl-1 text-sm font-medium transition-colors ${
          profileActive
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <Avatar src={session.user.image ?? null} name={name} size={28} />
        <span className="max-w-[7rem] truncate sm:max-w-none">{name}</span>
      </Link>
      <button
        onClick={() => signOut()}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-red-400"
      >
        Sign out
      </button>
    </div>
  );
}
