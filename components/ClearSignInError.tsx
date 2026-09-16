"use client";

import { useEffect } from "react";

/**
 * Takes a failure out of the URL once it has been read.
 *
 * The banner above is drawn from query parameters and nothing else, so the URL
 * that showed it goes on showing it forever: a back swipe, a reload, a
 * bookmark, or a link pasted to somebody else all replay a failure that may
 * have been fixed hours ago. One of us spent an afternoon chasing a database
 * error that had already been migrated away, because the page kept saying it.
 *
 * Rendered next to the banner, so the message stays on screen — replaceState
 * changes the address, not the document. Next.js supports the native History
 * API for exactly this, and replace rather than push so the back button still
 * goes where it went before instead of into a cleaned copy of this page.
 */
export function ClearSignInError() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const stale = ["error", "step", "dbError", "dbColumn", "code"].filter((key) =>
      url.searchParams.has(key)
    );
    if (stale.length === 0) return;

    for (const key of stale) url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return null;
}
