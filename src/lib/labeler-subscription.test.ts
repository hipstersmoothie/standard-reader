import { describe, expect, it } from "vitest";

import type { LabelVisibility } from "./labeler-subscription";
import {
  labelerSubscriptionEnabled,
  subscriptionLabelPrefs,
} from "./labeler-subscription";

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

describe("subscriptionLabelPrefs", () => {
  it("defaults every declared label to warn", () => {
    expect(subscriptionLabelPrefs(["spam", "bot"])).toEqual([
      { val: "spam", visibility: "warn" },
      { val: "bot", visibility: "warn" },
    ]);
  });

  it("lets a preset visibility win over the default", () => {
    const preset = new Map<string, LabelVisibility>([
      ["spam", "hide"],
      ["bot", "ignore"],
    ]);
    expect(subscriptionLabelPrefs(["spam", "bot", "nsfw"], preset)).toEqual([
      { val: "spam", visibility: "hide" },
      { val: "bot", visibility: "ignore" },
      { val: "nsfw", visibility: "warn" },
    ]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    // A labeler declaring the same identifier twice must not produce two prefs
    // for one label — the reader's toggle would then depend on array order.
    const preset = new Map<string, LabelVisibility>([["spam", "hide"]]);
    expect(subscriptionLabelPrefs(["spam", "spam"], preset)).toEqual([
      { val: "spam", visibility: "hide" },
    ]);
  });

  it("ignores empty label values", () => {
    expect(subscriptionLabelPrefs(["", "spam"])).toEqual([
      { val: "spam", visibility: "warn" },
    ]);
  });

  it("returns nothing for a labeler that declares no labels", () => {
    expect(subscriptionLabelPrefs([])).toEqual([]);
  });
});
