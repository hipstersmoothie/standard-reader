import { describe, expect, it } from "vitest";

import {
  basicScope,
  clientMetadataScope,
  collectionsScope,
  formatOAuthScope,
  hasCollectionsScope,
  hasMuteWriteScope,
  resolveAuthScopeForUser,
} from "./scope";

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

const AUTH_SOCIAL = "include:site.standard.authSocial";
const AUTH_FULL = "include:site.standard.authFull";
const AUTH_COLLECTIONS = "include:app.standard-reader.authCollections";

/**
 * Likes (`site.standard.graph.recommend`) are granted by an upstream permission
 * set we don't control, and a set is expanded by the reader's PDS at grant
 * time. `authFull` lists `graph.recommend` today, but a grant issued before it
 * did leaves a collections author able to write publications, documents and
 * subscriptions while every like is rejected — so the tier must not rest on
 * `authFull` alone for it.
 */
describe("collections-tier scope keeps likes grantable", () => {
  it("requests authSocial alongside authFull, not instead of it", () => {
    expect(collectionsScope).toContain(AUTH_SOCIAL);
    expect(collectionsScope).toContain(AUTH_FULL);
  });

  it("keeps every basic-tier scope — the tier only adds", () => {
    for (const entry of basicScope) {
      expect(collectionsScope).toContain(entry);
    }
    expect(collectionsScope).toContain(AUTH_COLLECTIONS);
  });

  it("still reads as the collections tier once granted", () => {
    expect(hasCollectionsScope(formatOAuthScope(collectionsScope))).toBe(true);
  });

  it("asks a returning collections author for the like scope", () => {
    const scope = resolveAuthScopeForUser(
      { collectionsAuthoringEnabled: true },
      // No explicit intent: the tier comes from the user row, as it does on
      // every re-login and on the reconnect prompt's re-authorize.
      undefined,
      {},
    ).split(" ");
    expect(scope).toContain(AUTH_SOCIAL);
    expect(scope).toContain(AUTH_FULL);
  });

  it("leaves the basic tier untouched", () => {
    const scope = resolveAuthScopeForUser(
      { collectionsAuthoringEnabled: false },
      undefined,
      {},
    ).split(" ");
    expect(scope).toContain(AUTH_SOCIAL);
    expect(scope).not.toContain(AUTH_FULL);
    expect(scope).not.toContain(AUTH_COLLECTIONS);
  });

  it("declares every requested token in client metadata, exactly once", () => {
    expect(clientMetadataScope).toContain(AUTH_SOCIAL);
    expect(clientMetadataScope).toContain(AUTH_FULL);
    expect(new Set(clientMetadataScope).size).toBe(clientMetadataScope.length);
    for (const entry of collectionsScope) {
      expect(clientMetadataScope).toContain(entry);
    }
  });
});
