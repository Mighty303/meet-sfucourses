"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

interface Props {
  /**
   * The mobile menu, where the row has the whole panel width to itself, so the
   * account block is styled as menu rows rather than as the compact desktop
   * control. It already lists Profile, so there is nothing for a menu to hold.
   */
  stacked?: boolean;
  /** Where Profile goes. Built by the nav, which has the path to read. */
  profileHref?: string;
  profileActive?: boolean;
  /** Admin moves in here with the rest of the account-scoped rows. */
  adminHref?: string;
}

/**
 * Who you're signed in as, and everything that belongs to the account.
 *
 * Signed in, the picture is a button rather than a label: Profile, Admin and
 * Sign out are all things you do to your own account, and spreading them along
 * the bar mixed them in with the three pages the app is actually made of. One
 * control at the end of the bar, and the account rows live under it — which is
 * also where a fourth row can go later without the bar growing.
 */
export function AuthButton({ stacked = false, profileHref = "/profile", profileActive = false, adminHref = "/admin" }: Props) {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />;
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
    <AccountMenu
      name={name}
      email={session.user.email ?? null}
      image={session.user.image ?? null}
      profileHref={profileHref}
      profileActive={profileActive}
      adminHref={session.isAdmin === true ? adminHref : null}
    />
  );
}

/**
 * The picture, and the rows behind it.
 *
 * Deliberately not a `<dialog>` or a portal: the panel is four rows of links
 * anchored to the button that opened it, and the nav is the only thing above
 * it on the page. Open state is local because nothing else needs to know.
 */
function AccountMenu({
  name,
  email,
  image,
  profileHref,
  profileActive,
  adminHref,
}: {
  name: string;
  email: string | null;
  image: string | null;
  profileHref: string;
  profileActive: boolean;
  /** Null for everyone who isn't an admin, which is almost everyone. */
  adminHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Pointer down rather than click, so pressing a link elsewhere on the page
    // closes this on the way down instead of after the navigation starts.
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-menu"
        aria-label={`Account: ${name}`}
        className={`flex items-center gap-1 rounded-full p-0.5 transition-colors ${
          open || profileActive
            ? "bg-neutral-200 dark:bg-neutral-700"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
      >
        <Avatar src={image} name={name} size={30} />
        <Chevron open={open} />
      </button>

      {open && (
        <div
          id="account-menu"
          role="menu"
          // Navigating is the point, so a press on any row inside closes the
          // panel on the way out.
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          {/* The name left the bar when the picture became the button, so it
              goes here — a picture alone doesn't say which account. */}
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            {email && email !== name && (
              <p className="truncate text-xs text-neutral-500">{email}</p>
            )}
          </div>

          <div className="border-t border-neutral-200 pt-1 dark:border-neutral-800">
            <MenuLink href={profileHref} active={profileActive}>Profile</MenuLink>
            {adminHref && <MenuLink href={adminHref} active={false}>Admin</MenuLink>}
          </div>

          {/* Sign out isn't destructive, so it stays neutral until hover, and
              sits behind a divider so it isn't hit on the way to Profile. */}
          <div className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
            <button
              role="menuitem"
              onClick={() => signOut()}
              className="w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-red-400"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`mr-1 text-neutral-500 transition-transform dark:text-neutral-400 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}
