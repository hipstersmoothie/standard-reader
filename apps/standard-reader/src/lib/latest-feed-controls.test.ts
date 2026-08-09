import { describe, expect, it } from "vitest";

import { latestControlsVisibility } from "./latest-feed-controls";
import type { LatestControlsState } from "./latest-feed-controls";

function state(
  overrides: Partial<LatestControlsState> = {},
): LatestControlsState {
  return {
    countsPending: false,
    filter: "unread",
    signedIn: true,
    trackReading: true,
    unreadCount: 148,
    ...overrides,
  };
}

describe("latestControlsVisibility", () => {
  it("shows both controls on the unread feed", () => {
    expect(latestControlsVisibility(state())).toEqual({
      markAllReadDisabled: false,
      showMarkAllRead: true,
      showRssFeed: true,
    });
  });

  // The bug this module exists for: `/latest` normalises to `?filter=unread`,
  // and a reader with reading history off is redirected to `?filter=subscriptions`
  // right after the first paint. Gating on `filter === "unread"` made the
  // buttons flash in and disappear, and the URL kept them gone across reloads.
  it("keeps the RSS button on the subscriptions feed", () => {
    expect(
      latestControlsVisibility(state({ filter: "subscriptions" })).showRssFeed,
    ).toBe(true);
  });

  it("keeps the RSS button when the reader has reading history off", () => {
    expect(
      latestControlsVisibility(
        state({ filter: "subscriptions", trackReading: false }),
      ),
    ).toMatchObject({ showMarkAllRead: false, showRssFeed: true });
  });

  it("hides both controls on the network-wide feeds", () => {
    for (const filter of ["all", "trending"] as const) {
      expect(latestControlsVisibility(state({ filter }))).toMatchObject({
        showMarkAllRead: false,
        showRssFeed: false,
      });
    }
  });

  it("hides both controls for signed-out readers", () => {
    expect(latestControlsVisibility(state({ signedIn: false }))).toMatchObject({
      showMarkAllRead: false,
      showRssFeed: false,
    });
  });

  it("disables rather than unmounts mark-all-read once nothing is unread", () => {
    expect(latestControlsVisibility(state({ unreadCount: 0 }))).toMatchObject({
      markAllReadDisabled: true,
      showMarkAllRead: true,
    });
  });

  it("disables mark-all-read while the counts are still loading", () => {
    expect(
      latestControlsVisibility(state({ countsPending: true, unreadCount: 0 })),
    ).toMatchObject({ markAllReadDisabled: true, showMarkAllRead: true });
  });
});
