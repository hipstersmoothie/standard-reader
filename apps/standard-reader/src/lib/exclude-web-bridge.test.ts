import { describe, expect, it } from "vitest";

import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";

import {
  bridgeExclusionFromKey,
  bridgeExclusionToDbValues,
  bridgeExclusionToKey,
  dbValuesToBridgeExclusion,
  isBridgeExclusionKey,
} from "./exclude-web-bridge";

describe("bridge exclusion preference", () => {
  it("defaults to showing every bridge when nothing is stored", () => {
    expect(dbValuesToBridgeExclusion({})).toBe(false);
    expect(
      dbValuesToBridgeExclusion({
        excludeWebBridge: null,
        excludeAllBridges: null,
      }),
    ).toBe(false);
  });

  it("keeps the original web-only column's meaning", () => {
    expect(
      dbValuesToBridgeExclusion({
        excludeWebBridge: true,
        excludeAllBridges: null,
      }),
    ).toBe("web");
  });

  it("lets the all-bridges column win", () => {
    expect(
      dbValuesToBridgeExclusion({
        excludeWebBridge: false,
        excludeAllBridges: true,
      }),
    ).toBe("all");
  });

  it.each<BridgeExclusion>([false, "web", "all"])(
    "round-trips %s through the database columns and the picker key",
    (exclusion) => {
      expect(
        dbValuesToBridgeExclusion(bridgeExclusionToDbValues(exclusion)),
      ).toBe(exclusion);
      expect(bridgeExclusionFromKey(bridgeExclusionToKey(exclusion))).toBe(
        exclusion,
      );
    },
  );

  it("rejects keys the picker does not offer", () => {
    expect(isBridgeExclusionKey("web")).toBe(true);
    expect(isBridgeExclusionKey("false")).toBe(false);
    expect(isBridgeExclusionKey(undefined)).toBe(false);
  });
});
