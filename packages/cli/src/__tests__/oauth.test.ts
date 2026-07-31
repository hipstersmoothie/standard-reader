/**
 * The OAuth pieces that can be checked without a browser.
 *
 * The flow itself needs a human at a consent screen, but the parts that go
 * wrong silently do not: the shape of the loopback `client_id`, the scope the
 * consent screen will show, and the fact that a saved session round-trips with
 * the redirect URI its grant was issued against.
 */

import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLI_SCOPE,
  clientForSavedSession,
  createOAuthClient,
} from "../oauth/client.js";
import type { SavedSession } from "../oauth/store.js";
import {
  configDir,
  credentialsPath,
  forgetSession,
  readSavedSession,
  readSavedSessions,
  saveSession,
} from "../oauth/store.js";

const REDIRECT = "http://127.0.0.1:43117/callback";

function savedSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    did: "did:plc:someone" as SavedSession["did"],
    handle: "someone.example",
    redirectUri: REDIRECT,
    scope: CLI_SCOPE,
    service: "https://pds.example.com",
    session: { note: "opaque to us" } as unknown as SavedSession["session"],
    ...overrides,
  };
}

const originalHome = process.env.XDG_CONFIG_HOME;

beforeEach(async () => {
  process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), "sr-config-"));
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalHome;
});

describe("the scope the consent screen will show", () => {
  it("asks for atproto plus one collection, and nothing else", () => {
    expect(CLI_SCOPE).toBe(
      "atproto repo?collection=site.standard.document&action=update",
    );
  });

  it("cannot create or delete records", () => {
    // The CLI only rewrites documents it already found. A scope that also
    // allowed create or delete would be asking for trust it does not need.
    expect(CLI_SCOPE).not.toContain("action=create");
    expect(CLI_SCOPE).not.toContain("action=delete");
    expect(CLI_SCOPE).not.toContain("transition:generic");
  });
});

describe("the loopback client", () => {
  it("builds a localhost client_id carrying the redirect URI and scope", () => {
    const client = createOAuthClient({ redirectUri: REDIRECT });
    const clientId = client.metadata.client_id ?? "";

    expect(clientId.startsWith("http://localhost?")).toBe(true);
    const params = new URL(clientId).searchParams;
    expect(params.get("redirect_uri")).toBe(REDIRECT);
    expect(params.get("scope")).toBe(CLI_SCOPE);
  });

  it("gives a different client_id for a different port", () => {
    // This is why the redirect URI is persisted: the port is part of the
    // client's identity, and a refresh must present the same one.
    const a = createOAuthClient({ redirectUri: REDIRECT }).metadata.client_id;
    const b = createOAuthClient({
      redirectUri: "http://127.0.0.1:1234/callback",
    }).metadata.client_id;
    expect(a).not.toBe(b);
  });

  it("rebuilds a saved session's client with the identical client_id", () => {
    const saved = savedSession();
    const atLogin = createOAuthClient({ redirectUri: saved.redirectUri });
    const later = clientForSavedSession(saved);

    // Byte-identical, or the authorization server refuses the refresh.
    expect(atLogin.metadata.client_id).toBeTruthy();
    expect(later.metadata.client_id).toBe(atLogin.metadata.client_id);
  });

  it("is a public client — no keyset, no secret to leak", () => {
    const client = createOAuthClient({ redirectUri: REDIRECT });
    expect(client.keyset).toBeUndefined();
    expect(client.jwks).toBeUndefined();
  });
});

describe("the credential file", () => {
  it("saves and reads a session back", async () => {
    await saveSession(savedSession());
    const read = await readSavedSession("did:plc:someone");
    expect(read?.handle).toBe("someone.example");
    expect(read?.redirectUri).toBe(REDIRECT);
  });

  it("returns the current account when no DID is named", async () => {
    await saveSession(savedSession());
    const current = await readSavedSession();
    expect(current?.did).toBe("did:plc:someone");
  });

  it("is written user-only, since it holds bearer-equivalent material", async () => {
    await saveSession(savedSession());
    const file = await stat(credentialsPath());
    const dir = await stat(configDir());
    expect(file.mode & 0o777).toBe(0o600);
    expect(dir.mode & 0o777).toBe(0o700);
  });

  it("keeps several accounts and tracks which is current", async () => {
    await saveSession(savedSession());
    await saveSession(
      savedSession({
        did: "did:plc:other" as SavedSession["did"],
        handle: "other.example",
      }),
    );

    const file = await readSavedSessions();
    expect(Object.keys(file.accounts)).toHaveLength(2);
    // The most recent sign-in becomes the default.
    expect(file.current).toBe("did:plc:other");
  });

  it("forgets one account and moves `current` off it", async () => {
    await saveSession(savedSession());
    await saveSession(
      savedSession({ did: "did:plc:other" as SavedSession["did"] }),
    );

    await forgetSession("did:plc:other");
    const file = await readSavedSessions();
    expect(Object.keys(file.accounts)).toEqual(["did:plc:someone"]);
    expect(file.current).toBe("did:plc:someone");
  });

  it("removes the file entirely when the last account is forgotten", async () => {
    await saveSession(savedSession());
    await forgetSession();
    await expect(readFile(credentialsPath(), "utf8")).rejects.toThrow();
    expect(await readSavedSession()).toBeNull();
  });

  it("reports no session rather than throwing when nothing is saved", async () => {
    expect(await readSavedSession()).toBeNull();
    expect(await forgetSession()).toEqual([]);
  });
});
