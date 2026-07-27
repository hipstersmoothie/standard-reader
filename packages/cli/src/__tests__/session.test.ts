/**
 * Which session a command opens, and what it is allowed to do.
 *
 * The rule this file guards: credentials are required for writing and for
 * nothing else. Getting it wrong in one direction makes `--dry-run` demand an
 * app password to answer a question that touches no records; getting it wrong
 * in the other lets a read-only session reach a write path.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseArgs } from "../args.js";
import type * as AtprotoModule from "../atproto.js";

const login = vi.fn();
const openPublicSession = vi.fn();
const restoreOAuthSession = vi.fn();

vi.mock("../atproto.js", async (importOriginal) => {
  const actual = await importOriginal<typeof AtprotoModule>();
  return {
    ...actual,
    login: (...args: Array<unknown>) => login(...args),
    openPublicSession: (...args: Array<unknown>) => openPublicSession(...args),
    restoreOAuthSession: (...args: Array<unknown>) =>
      restoreOAuthSession(...args),
  };
});

const { openSession } = await import("../session.js");
const { CliError, putDocumentContent } = await import("../atproto.js");

const args = (argv: Array<string>) => parseArgs(["convert", ...argv]);

beforeEach(() => {
  login.mockReset().mockResolvedValue({ canWrite: true, did: "did:plc:me" });
  openPublicSession
    .mockReset()
    .mockResolvedValue({ canWrite: false, did: "did:plc:them" });
  // No saved OAuth sign-in unless a test says otherwise.
  restoreOAuthSession.mockReset().mockResolvedValue(null);
  delete process.env.STANDARD_READER_IDENTIFIER;
  delete process.env.STANDARD_READER_APP_PASSWORD;
});

describe("openSession — OAuth first", () => {
  const oauth = { auth: "oauth", canWrite: true, did: "did:plc:me" };

  it("uses a saved OAuth sign-in in preference to an app password", async () => {
    // An app password sitting in the environment should not beat a session the
    // user deliberately established, and which is scoped far more narrowly.
    process.env.STANDARD_READER_IDENTIFIER = "me.example";
    process.env.STANDARD_READER_APP_PASSWORD = "app-password";
    restoreOAuthSession.mockResolvedValue(oauth);

    expect(await openSession(args([]), { needsWrite: true })).toBe(oauth);
    expect(login).not.toHaveBeenCalled();
  });

  it("uses the saved sign-in for a read too, with no repo named", async () => {
    restoreOAuthSession.mockResolvedValue(oauth);
    expect(await openSession(args([]), { needsWrite: false })).toBe(oauth);
  });

  it("lets an explicit --password override the saved sign-in", async () => {
    // Passing a credential on the command line is a deliberate act, usually
    // for CI or to act as a different account.
    restoreOAuthSession.mockResolvedValue(oauth);

    await openSession(
      args(["--identifier", "other.example", "--password", "pw"]),
      { needsWrite: true },
    );

    expect(login).toHaveBeenCalledTimes(1);
    expect(restoreOAuthSession).not.toHaveBeenCalled();
  });

  it("passes --did through so one of several accounts can be chosen", async () => {
    restoreOAuthSession.mockResolvedValue(oauth);
    await openSession(args(["--did", "did:plc:pick"]), { needsWrite: true });
    expect(restoreOAuthSession).toHaveBeenCalledWith("did:plc:pick");
  });

  it("falls back to an app password when nothing is saved", async () => {
    process.env.STANDARD_READER_IDENTIFIER = "me.example";
    process.env.STANDARD_READER_APP_PASSWORD = "app-password";

    await openSession(args([]), { needsWrite: true });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("points at `login` when a write has no credential at all", async () => {
    await expect(openSession(args([]), { needsWrite: false })).rejects.toThrow(
      /standard-reader login/,
    );
  });
});

describe("openSession", () => {
  it("reads a public repo with no credentials at all", async () => {
    await openSession(args(["--repo", "someone.example"]), {
      needsWrite: false,
    });

    expect(openPublicSession).toHaveBeenCalledWith("someone.example");
    expect(login).not.toHaveBeenCalled();
  });

  it("signs in when the command may write", async () => {
    process.env.STANDARD_READER_IDENTIFIER = "me.example";
    process.env.STANDARD_READER_APP_PASSWORD = "app-password";

    await openSession(args([]), { needsWrite: true });

    expect(login).toHaveBeenCalledTimes(1);
    expect(openPublicSession).not.toHaveBeenCalled();
  });

  it("prefers a signed-in session when credentials are available", async () => {
    // Reading your own repo signed in is the common case; `--repo` is for
    // pointing at someone else's.
    process.env.STANDARD_READER_IDENTIFIER = "me.example";
    process.env.STANDARD_READER_APP_PASSWORD = "app-password";

    await openSession(args([]), { needsWrite: false });

    expect(login).toHaveBeenCalledTimes(1);
    expect(openPublicSession).not.toHaveBeenCalled();
  });

  it("demands credentials for a write even when --repo is given", async () => {
    await expect(
      openSession(args(["--repo", "someone.example"]), { needsWrite: true }),
    ).rejects.toThrow(CliError);
    expect(openPublicSession).not.toHaveBeenCalled();
  });

  it("explains what to do when there is neither a repo nor credentials", async () => {
    await expect(openSession(args([]), { needsWrite: false })).rejects.toThrow(
      /--repo <handle-or-did>/,
    );
  });

  it("takes credentials from flags over the environment", async () => {
    process.env.STANDARD_READER_IDENTIFIER = "env.example";
    process.env.STANDARD_READER_APP_PASSWORD = "env-password";

    await openSession(
      args(["--identifier", "flag.example", "--password", "flag-password"]),
      { needsWrite: true },
    );

    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "flag.example",
        password: "flag-password",
      }),
    );
  });

  it("does not treat a half-filled credential pair as signed in", async () => {
    // An identifier with no password used to fall through to a login attempt
    // that could only fail; without a repo the useful answer is the message.
    process.env.STANDARD_READER_IDENTIFIER = "me.example";

    await expect(openSession(args([]), { needsWrite: false })).rejects.toThrow(
      /--repo <handle-or-did>/,
    );
  });
});

describe("the read-only session cannot write", () => {
  it("refuses putDocumentContent instead of sending it", async () => {
    const session = {
      canWrite: false,
      client: {},
      did: "did:plc:them",
      handle: "someone.example",
      service: "https://pds.example",
    } as unknown as AtprotoModule.Session;

    await expect(
      putDocumentContent(session, {
        content: { $type: "blog.pckt.content" },
        record: {},
        repo: "did:plc:them",
        rkey: "abc",
        swapRecord: "bafy",
      }),
    ).rejects.toThrow(/read-only/);
  });
});
