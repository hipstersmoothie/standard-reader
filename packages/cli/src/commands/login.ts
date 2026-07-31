/**
 * `standard-reader login` / `logout` / `whoami`.
 *
 * Sign-in opens the browser and hands off to the user's own PDS, so no
 * credential ever passes through this process — the CLI only ever holds a
 * scoped, revocable token.
 */

import type { ParsedArgs } from "../args.js";
import { one } from "../args.js";
import { restoreOAuthSession, signOut } from "../atproto.js";
import { CLI_SCOPE } from "../oauth/client.js";
import { loginWithBrowser } from "../oauth/login.js";
import { credentialsPath, readSavedSessions } from "../oauth/store.js";
import { say, style } from "../output.js";

/** Turn the scope string into something a person can check against the prompt. */
function describeScope(scope: string): Array<string> {
  return scope.split(/\s+/).filter(Boolean);
}

export async function runLogin(args: ParsedArgs): Promise<number> {
  const identifier = one(args, "identifier") ?? args.positionals[0];

  say(style.bold("Signing in to AT Protocol"));
  say(
    `  ${style.dim("This CLI will ask for:")} ${describeScope(CLI_SCOPE).join(style.dim(", "))}`,
  );
  say(style.dim("  Your password is entered on your own server, never here."));
  say();

  const result = await loginWithBrowser({
    identifier,
    onUrl: (url, opened) => {
      if (opened) {
        say(`${style.dim("Opened your browser.")} Waiting for authorization…`);
        say(style.dim(`If it did not open: ${url}`));
      } else {
        say("Open this URL to authorize:");
        say(`  ${style.cyan(url)}`);
      }
    },
  });

  say();
  say(
    `${style.green("✓")} Signed in as ${style.bold(result.handle)} ${style.dim(`(${result.did})`)}`,
  );
  say(style.dim(`  Session saved to ${credentialsPath()}`));
  // Public OAuth clients get a much shorter refresh window than a web app, so
  // say it now rather than let it surprise someone in a fortnight.
  say(
    style.dim(
      "  Public clients get a short refresh window; expect to sign in again in a couple of weeks.",
    ),
  );
  return 0;
}

export async function runLogout(args: ParsedArgs): Promise<number> {
  const removed = await signOut(one(args, "did"));
  if (removed.length === 0) {
    say("You are not signed in.");
    return 0;
  }
  for (const did of removed) {
    say(`${style.green("✓")} Signed out ${style.dim(did)}`);
  }
  return 0;
}

export async function runWhoami(args: ParsedArgs): Promise<number> {
  const json = args.flags.has("json");
  const file = await readSavedSessions();
  const accounts = Object.values(file.accounts);

  if (json) {
    say(
      JSON.stringify(
        {
          accounts: accounts.map((account) => ({
            current: account.did === file.current,
            did: account.did,
            handle: account.handle,
            scope: account.scope,
            service: account.service,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (accounts.length === 0) {
    say("Not signed in. Run `standard-reader login`.");
    return 0;
  }

  for (const account of accounts) {
    const mark = account.did === file.current ? style.green("*") : " ";
    say(`${mark} ${style.bold(account.handle)} ${style.dim(account.did)}`);
    say(`    ${style.dim(account.service)}`);
    say(`    ${style.dim(account.scope)}`);
  }

  // Prove the saved grant still works rather than only that a file exists.
  const live = await restoreOAuthSession(file.current);
  say();
  say(
    live
      ? style.dim("Session is valid.")
      : style.yellow("No usable session; run `standard-reader login`."),
  );
  return 0;
}
