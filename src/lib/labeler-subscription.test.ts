import { describe, expect, it } from "vitest";

import { labelerSubscriptionEnabled } from "./labeler-subscription";

describe("labelerSubscriptionEnabled", () => {
  it("treats an absent flag as enabled", () => {
    // Every subscription written before `enabled` existed omits it. Reading
    // those as muted would silently disable everyone's labelers at once.
    expect(labelerSubscriptionEnabled({})).toBe(true);
    expect(labelerSubscriptionEnabled({ enabled: undefined })).toBe(true);
  });

  it("treats an explicit true as enabled", () => {
    expect(labelerSubscriptionEnabled({ enabled: true })).toBe(true);
  });

  it("mutes only on an explicit false", () => {
    expect(labelerSubscriptionEnabled({ enabled: false })).toBe(false);
  });
});
