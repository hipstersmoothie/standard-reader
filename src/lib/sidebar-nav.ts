import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * Stable ids for the primary sidebar nav items that "Customize sidebar" can
 * hide. These strings are persisted in the reader's `sidebarPref` record, so
 * they must stay stable even if a route path changes. Subscriptions and its
 * list groups are intentionally not part of this set — they can't be hidden.
 */
export type SidebarNavId =
  | "home"
  | "latest"
  | "saved"
  | "collections"
  | "discover"
  | "search";

export interface SidebarNavMeta {
  id: SidebarNavId;
  /** Route the item links to. */
  to: string;
  label: MessageDescriptor;
  /** Only rendered in the sidebar when the reader is signed in. */
  signedInOnly: boolean;
}

/**
 * The hideable primary nav items, in the order they appear in the sidebar
 * (Saved + Collections sit between Latest and Discover for signed-in readers).
 * The "Customize sidebar" settings UI iterates this list.
 */
export const CUSTOMIZABLE_SIDEBAR_NAV: ReadonlyArray<SidebarNavMeta> = [
  { id: "home", to: "/", label: msg`Home`, signedInOnly: false },
  { id: "latest", to: "/latest", label: msg`Latest`, signedInOnly: false },
  {
    id: "saved",
    to: "/saved",
    label: msg`Saved for later`,
    signedInOnly: true,
  },
  {
    id: "collections",
    to: "/collections",
    label: msg`Collections`,
    signedInOnly: true,
  },
  {
    id: "discover",
    to: "/discover",
    label: msg`Discover`,
    signedInOnly: false,
  },
  { id: "search", to: "/search", label: msg`Search`, signedInOnly: false },
];

/** Map a nav route to its stable customize id, if it is a hideable item. */
const ID_BY_ROUTE = new Map<string, SidebarNavId>(
  CUSTOMIZABLE_SIDEBAR_NAV.map((item) => [item.to, item.id]),
);

export function sidebarNavIdForRoute(to: string): SidebarNavId | undefined {
  return ID_BY_ROUTE.get(to);
}
