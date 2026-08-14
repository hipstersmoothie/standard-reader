import { describe, expect, it } from "vitest";

import { hasMuteWriteScope } from "./scope";

const MUTE = "app.standard-reader.graph.mute";

describe("hasMuteWriteScope", () => {
  it("accepts the verbatim authBasicFeatures set token", () => {
    expect(
      hasMuteWriteScope(
        "atproto include:app.standard-reader.authBasicFeatures",
      ),
    ).toBe(true);
  });

  it("accepts a PDS-expanded repo?collection token", () => {
    expect(
      hasMuteWriteScope(`atproto repo?collection=${MUTE}&action=create`),
    ).toBe(true);
    // Several collections in one token.
    expect(
      hasMuteWriteScope(
        `atproto repo?collection=app.standard-reader.bookmark&collection=${MUTE}`,
      ),
    ).toBe(true);
  });

  it("accepts the action-less repo: form", () => {
    expect(hasMuteWriteScope(`atproto repo:${MUTE}`)).toBe(true);
  });

  it("rejects tokens granting other collections only", () => {
    expect(
      hasMuteWriteScope(
        "atproto repo?collection=app.standard-reader.bookmark&action=create",
      ),
    ).toBe(false);
    expect(hasMuteWriteScope("atproto repo:app.standard-reader.read")).toBe(
      false,
    );
  });

  it("rejects a mute token whose actions exclude create", () => {
    expect(
      hasMuteWriteScope(`atproto repo?collection=${MUTE}&action=delete`),
    ).toBe(false);
  });

  it("rejects empty and absent scopes", () => {
    expect(hasMuteWriteScope(null)).toBe(false);
    expect(hasMuteWriteScope("")).toBe(false);
    expect(hasMuteWriteScope("atproto")).toBe(false);
  });
});
