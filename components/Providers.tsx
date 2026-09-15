"use client";

import { SessionProvider } from "next-auth/react";
import { ClaimGuestCourses } from "@/components/ClaimGuestCourses";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Renders nothing; it is here because it needs a session and every page
          is a way to get one. See ClaimGuestCourses. */}
      <ClaimGuestCourses />
      {children}
    </SessionProvider>
  );
}
