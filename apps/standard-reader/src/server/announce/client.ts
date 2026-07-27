/**
 * Log in as the Standard Reader posting account via a Bluesky app password and
 * return an `@atcute/client` `Client` ready to write records. Mirrors the bot
 * login in `scripts/register-labelers.ts`.
 *
 * NOTE: deliberately does NOT go through `isAppPasswordAuthEnabled()` (the
 * dev/perf-only gate in `app-password-session.server.ts`, disabled in
 * production). This is a standalone cron process with its own dedicated creds.
 */
import { Client } from "@atcute/client";
import { PasswordSession } from "@atcute/password-session";

import { readerBotCredentials } from "./config.ts";

export interface ReaderBotSession {
  client: Client;
  /** DID of the authenticated posting account (used as the write `repo`). */
  repo: string;
  handle: string;
}

export async function loginAsReaderBot(): Promise<ReaderBotSession> {
  const { identifier, password, service } = readerBotCredentials();
  const session = await PasswordSession.login({
    service,
    identifier,
    password,
  });
  const client = new Client({ handler: session });
  const repo = session.did;
  if (!repo) throw new Error("Bot login did not establish a session DID.");
  return { client, repo, handle: session.session.handle };
}
