"use client";

import { SessionProvider } from "next-auth/react";
import { ClaimGuestCourses } from "@/components/ClaimGuestCourses";
import { SfuDoorProvider } from "@/components/SfuDoor";

export function Providers({
  sfu = false,
  children,
}: {
  /** `casEnabled()`, resolved by the root layout. See SfuDoorProvider. */
  sfu?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SfuDoorProvider open={sfu}>
      <SessionProvider>
        {/* Renders nothing; it is here because it needs a session and every page
            is a way to get one. See ClaimGuestCourses. */}
        <ClaimGuestCourses />
        {children}
      </SessionProvider>
    </SfuDoorProvider>
  );
}
