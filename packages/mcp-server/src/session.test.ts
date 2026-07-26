import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PasswordSessionData } from "@atcute/password-session";
import { beforeEach, describe, expect, it } from "vitest";

import type { McpServerConfig } from "./config.js";
import { AuthRequiredError } from "./errors.js";
import { SessionManager } from "./session.js";

const STORED: PasswordSessionData = {
  service: "https://pds.test",
  accessJwt: "access",
  refreshJwt: "refresh",
  handle: "alice.example.com",
  did: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  active: true,
};

let config: McpServerConfig;

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), "sr-mcp-session-"));
  config = {
    service: "https://appview.test",
    pdsService: "https://pds.test",
    sessionFile: join(directory, "nested", "session.json"),
    identifier: undefined,
    password: undefined,
  };
});

describe("SessionManager persistence", () => {
  it("round-trips a session through the store", async () => {
    const sessions = new SessionManager(config);
    await sessions.write(STORED);
    expect(await sessions.read()).toEqual(STORED);
  });

  it("creates the directory and keeps the file owner-only", async () => {
    const sessions = new SessionManager(config);
    await sessions.write(STORED);

    const stats = await stat(config.sessionFile);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("writes a versioned envelope so the format can evolve", async () => {
    const sessions = new SessionManager(config);
    await sessions.write(STORED);

    const parsed = JSON.parse(await readFile(config.sessionFile, "utf8"));
    expect(parsed.version).toBe(1);
    expect(parsed.session.did).toBe(STORED.did);
  });

  it("reads nothing when there is no session file", async () => {
    expect(await new SessionManager(config).read()).toBeNull();
  });

  it("treats a truncated or unversioned file as no session", async () => {
    const sessions = new SessionManager(config);
    await sessions.write(STORED);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(config.sessionFile, "{not json");
    expect(await sessions.read()).toBeNull();

    await writeFile(config.sessionFile, JSON.stringify({ session: STORED }));
    expect(await sessions.read()).toBeNull();

    await writeFile(
      config.sessionFile,
      JSON.stringify({ version: 1, session: { did: STORED.did } }),
    );
    expect(await sessions.read()).toBeNull();
  });

  it("erases the file on logout even with nothing stored", async () => {
    const sessions = new SessionManager(config);
    expect(await sessions.logout()).toBe(false);
    expect(await sessions.read()).toBeNull();
  });
});

describe("SessionManager resolution", () => {
  it("returns null rather than throwing when there is no credential", async () => {
    expect(await new SessionManager(config).current()).toBeNull();
  });

  it("throws an actionable error when a write demands a session", async () => {
    await expect(new SessionManager(config).require()).rejects.toThrow(
      AuthRequiredError,
    );
    await expect(new SessionManager(config).require()).rejects.toThrow(/auth/);
  });
});
