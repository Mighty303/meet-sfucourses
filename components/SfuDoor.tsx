"use client";

import { createContext, useContext } from "react";

/**
 * Whether the SFU door is open, carried down to client components.
 *
 * `casEnabled()` reads server-only environment, so a client component cannot
 * ask it directly — and the sign-in panel is rendered in two very different
 * places. /signin is a server page and passes the answer as a prop; the group
 * page is `"use client"` from its first line, so the account gate it opens has
 * no server ancestor of its own to ask. This context is that ancestor: the
 * root layout is a Server Component, calls `casEnabled()` once, and every
 * client component below reads the same value — no second flag to keep in step
 * and no request to wait on before the modal can draw.
 *
 * The default `false` only decides what an unwrapped tree shows. The real gate
 * is `casEnabled()` in the start and callback routes, which refuse a ticket
 * whatever button happened to be rendered.
 */
const SfuDoorContext = createContext(false);

/** Whether to offer "Continue with your SFU ID". See SfuDoorContext. */
export function useSfuDoor(): boolean {
  return useContext(SfuDoorContext);
}

export function SfuDoorProvider({
  open,
  children,
}: {
  /** `casEnabled()`, resolved by the root layout on the server. */
  open: boolean;
  children: React.ReactNode;
}) {
  return <SfuDoorContext.Provider value={open}>{children}</SfuDoorContext.Provider>;
}
