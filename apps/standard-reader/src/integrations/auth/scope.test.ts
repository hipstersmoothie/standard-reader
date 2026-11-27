import { describe, expect, it } from "vitest";

import {
  basicScope,
  clientMetadataScope,
  collectionsScope,
  formatOAuthScope,
  hasCollectionsScope,
  hasMuteWriteScope,
  hasUserinputFeedbackScope,
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

/**
 * A PDS expands each `include:` set into granular `repo` tokens and returns
 * *those* as the token's scope, which the callback snapshots to
 * `account.scope`. rsky (blacksky.app) wrote them as `repo:?collection=…` — an
 * empty positional slot before the query — until 2026-11-06. Reading only the
 * positional slot made a granted collections tier look missing, so the upgrade
 * gate re-opened after every successful round trip: "the pop up just reloads
 * repeatedly".
 */
describe("granted scope from a PDS that expands permission sets", () => {
  /** What rsky granted for the collections upgrade request before its fix. */
  const RSKY_LEGACY_COLLECTIONS_GRANT = [
    "atproto",
    "blob:image/*",
    "repo:?collection=app.standard-reader.bookmark&collection=app.standard-reader.graph.follow&collection=app.standard-reader.read",
    "repo:?collection=site.standard.graph.subscription&collection=site.standard.graph.recommend",
    "rpc:app.bsky.actor.getPreferences?aud=*",
    "repo:?collection=app.standard-reader.collection&collection=app.standard-reader.collectionsPublication&collection=app.standard-reader.publicationTheme",
    "repo:?collection=site.standard.publication&collection=site.standard.document&collection=site.standard.graph.subscription&collection=site.standard.graph.recommend",
    "repo:?collection=app.userinput.discussion&collection=app.userinput.upvote&action=create",
  ].join(" ");

  /** The same grant in the reference form rsky writes since the fix. */
  const RSKY_CURRENT_COLLECTIONS_GRANT =
    RSKY_LEGACY_COLLECTIONS_GRANT.replaceAll("repo:?", "repo?");

  it("reads the legacy empty-positional repo:? form as the collections tier", () => {
    expect(hasCollectionsScope(RSKY_LEGACY_COLLECTIONS_GRANT)).toBe(true);
  });

  it("reads the reference repo? form as the collections tier", () => {
    expect(hasCollectionsScope(RSKY_CURRENT_COLLECTIONS_GRANT)).toBe(true);
  });

  it("applies to every addendum check, not just collections", () => {
    expect(hasUserinputFeedbackScope(RSKY_LEGACY_COLLECTIONS_GRANT)).toBe(true);
    expect(
      hasMuteWriteScope(
        `atproto repo:?collection=app.standard-reader.bookmark&collection=${MUTE}`,
      ),
    ).toBe(true);
  });

  it("still rejects a legacy-form grant missing a collections record", () => {
    const withoutTheme = RSKY_LEGACY_COLLECTIONS_GRANT.replace(
      "&collection=app.standard-reader.publicationTheme",
      "",
    );
    expect(hasCollectionsScope(withoutTheme)).toBe(false);
  });

  it("keeps action limits on the legacy form", () => {
    expect(
      hasMuteWriteScope(`atproto repo:?collection=${MUTE}&action=delete`),
    ).toBe(false);
  });

  it("ignores tokens that only look like repo scopes", () => {
    expect(hasMuteWriteScope(`atproto repository?collection=${MUTE}`)).toBe(
      false,
    );
  });
});
