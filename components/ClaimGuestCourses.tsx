"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { allGuestCourses, clearGuestCourses } from "@/lib/guest-schedule";

/**
 * Moves a guest's sections onto their account, the moment there is one.
 *
 * Without this, "you don't need an account" means "you don't need an account
 * until you do, and then you type it all again" — which is worse than asking
 * up front, because the work is already done and visibly thrown away. Someone
 * who filled in their week on the landing page and then signed up to put it in
 * a group should find it already there.
 *
 * Mounted once, in Providers, rather than on the pages that sign people in:
 * there are four ways to end up with a session (both providers, on two pages,
 * plus the group page's modal) and this has to run for all of them.
 *
 * Idempotent at both ends. addUserCourse is ON CONFLICT DO NOTHING, so a
 * section that made it across before a failure costs nothing on the retry, and
 * the local copy is only cleared once every one of them has landed.
 */
export function ClaimGuestCourses() {
  const { status } = useSession();
  const router = useRouter();
  // One attempt per mount. The session object changes identity on refresh,
  // and this must not fire again behind the copy that is still in flight.
  const claiming = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || claiming.current) return;
    const saved = Object.entries(allGuestCourses());
    if (saved.length === 0) return;
    claiming.current = true;

    (async () => {
      let allLanded = true;
      for (const [term, numbers] of saved) {
        for (const classNumber of numbers) {
          const res = await fetch("/api/me/courses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ term, classNumber }),
          }).catch(() => null);
          if (!res?.ok) allLanded = false;
        }
      }
      if (!allLanded) {
        // Leave the local copy and let the next page load try again.
        claiming.current = false;
        return;
      }
      clearGuestCourses();
      // The pages that draw a schedule are server-rendered, so the new
      // sections only appear once their data is read again.
      router.refresh();
    })();
  }, [status, router]);

  return null;
}
