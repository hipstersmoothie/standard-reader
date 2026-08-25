import { describe, expect, it } from "vitest";

import { declaresBot, selfLabelValues } from "./self-labels.ts";

describe("selfLabelValues", () => {
  it("reads the values an account declared", () => {
    expect(
      selfLabelValues({
        labels: { values: [{ val: "bot" }, { val: "nsfw" }] },
      }),
    ).toEqual(["bot", "nsfw"]);
  });

  it("normalizes case and whitespace, and de-duplicates", () => {
    expect(
      selfLabelValues({
        labels: { values: [{ val: " Bot " }, { val: "BOT" }] },
      }),
    ).toEqual(["bot"]);
  });

  it("survives every shape a record might actually be", () => {
    // These come off the firehose, so none of it is trustworthy.
    expect(selfLabelValues(null)).toEqual([]);
    expect(selfLabelValues({})).toEqual([]);
    expect(selfLabelValues({ labels: {} })).toEqual([]);
    expect(selfLabelValues({ labels: { values: "nope" } })).toEqual([]);
    expect(selfLabelValues({ labels: { values: [null] } })).toEqual([]);
    expect(selfLabelValues({ labels: { values: [{ val: 42 }] } })).toEqual([]);
    expect(selfLabelValues({ labels: { values: [{ val: "  " }] } })).toEqual(
      [],
    );
  });
});

describe("declaresBot", () => {
  it("is true only when `bot` is among the self-labels", () => {
    expect(declaresBot({ labels: { values: [{ val: "bot" }] } })).toBe(true);
    expect(declaresBot({ labels: { values: [{ val: "nsfw" }] } })).toBe(false);
    expect(declaresBot({})).toBe(false);
  });

  it("does not match a value that merely contains 'bot'", () => {
    expect(declaresBot({ labels: { values: [{ val: "robot" }] } })).toBe(false);
    expect(declaresBot({ labels: { values: [{ val: "bot-adjacent" }] } })).toBe(
      false,
    );
  });
});
