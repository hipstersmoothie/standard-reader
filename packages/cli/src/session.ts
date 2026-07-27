/**
 * Which session a command opens, and what it is allowed to do.
 *
 * Two rules shape this. Credentials are required for writing and for nothing
 * else — getting that wrong in one direction makes `--dry-run` demand a
 * credential to answer a question that touches no records, and in the other
 * lets a read-only session reach a write path. And when credentials *are*
 * needed, a saved OAuth sign-in is preferred over an app password: it is
 * scoped to the one collection this tool writes, and revoking it does not mean
 * rotating a credential that other tools also hold.
 */

import type { ParsedArgs } from "./args.js";
import { one } from "./args.js";
import type { Session } from "./atproto.js";
import {
  CliError,
  hasCredentials,
  login,
  openPublicSession,
  resolveCredentials,
  restoreOAuthSession,
} from "./atproto.js";

export interface OpenSessionOptions {
  /** True when the command may write records, so credentials are required. */
  needsWrite: boolean;
}

export async function openSession(
  args: ParsedArgs,
  options: OpenSessionOptions,
): Promise<Session> {
  const identifier = one(args, "identifier");
  const password = one(args, "password");
  const repo = one(args, "repo");

  // An explicit app password on the command line is a deliberate choice, so it
  // wins; otherwise a saved OAuth session is the better credential.
  const explicitPassword = Boolean(password ?? identifier);
  if (!explicitPassword) {
    const oauth = await restoreOAuthSession(one(args, "did"));
    if (oauth) return oauth;
  }

  if (options.needsWrite || hasCredentials({ identifier, password })) {
    return login(
      resolveCredentials({
        identifier,
        password,
        service: one(args, "pds"),
      }),
    );
  }

  if (!repo) {
    throw new CliError(
      "Nothing to read. Either sign in with `standard-reader login`, or name a\n" +
        "repo to read without signing in: --repo <handle-or-did>.",
    );
  }

  return openPublicSession(repo);
}
