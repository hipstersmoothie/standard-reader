/**
 * Choosing between a signed-in session and an anonymous one.
 *
 * Only writing needs credentials. `list`, and `convert --dry-run`, read public
 * endpoints (`listRecords`, `getBlob`) and do the conversion in memory — so
 * they run against any published blog, including someone else's, with nothing
 * configured. Requiring an app password to answer "what would this cost?" would
 * be asking for a credential to do arithmetic.
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
      "Nothing to read. Either sign in (--identifier + --password, or the\n" +
        "STANDARD_READER_* environment variables) or name a repo to read\n" +
        "without signing in: --repo <handle-or-did>.",
    );
  }

  return openPublicSession(repo);
}
