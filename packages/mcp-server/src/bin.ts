#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { describeError } from "./errors.js";
import { createServer, SERVER_VERSION } from "./server.js";
import { SessionManager } from "./session.js";

const USAGE = `standard-reader-mcp — Model Context Protocol server for Standard Reader

Usage:
  standard-reader-mcp                 Serve MCP over stdio (what an MCP host runs)
  standard-reader-mcp login           Sign in with an app password and store the session
  standard-reader-mcp logout          Revoke and remove the stored session
  standard-reader-mcp whoami          Print the stored session's account

Options (login):
  --identifier <handle>   Handle, DID or email. Prompted for when omitted.
  --password <app-pass>   App password. Prompted for (hidden) when omitted.
  --service <url>         PDS/entryway to authenticate against.
  --code <2fa>            Two-factor code, if the account requires one.

Environment:
  STANDARD_READER_SERVICE        AppView base URL (default https://standard-reader.app)
  STANDARD_READER_PDS            PDS/entryway for login (default https://bsky.social)
  STANDARD_READER_SESSION_FILE   Where the session is stored
  STANDARD_READER_IDENTIFIER     Handle/DID/email — sign in without a prior \`login\`
  STANDARD_READER_APP_PASSWORD   App password to go with it

Use an app password (bsky.app/settings/app-passwords), never your account password.
`;

function parseFlags(argv: Array<string>): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) continue;
    const equals = argument.indexOf("=");
    if (equals === -1) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[argument.slice(2)] = next;
        index += 1;
      } else {
        flags[argument.slice(2)] = "true";
      }
    } else {
      flags[argument.slice(2, equals)] = argument.slice(equals + 1);
    }
  }
  return flags;
}

/** Prompt on the TTY, optionally suppressing echo for secrets. */
async function prompt(question: string, hidden: boolean): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stderr.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    const answer = rl.question(question);
    muted = hidden;
    const value = await answer;
    if (hidden) process.stderr.write("\n");
    return value.trim();
  } finally {
    muted = false;
    rl.close();
  }
}

async function runLogin(argv: Array<string>): Promise<number> {
  const flags = parseFlags(argv);
  const config = loadConfig();
  const sessions = new SessionManager(config);

  const identifier =
    flags.identifier ??
    config.identifier ??
    (await prompt("Handle or DID: ", false));
  if (!identifier) {
    process.stderr.write("A handle or DID is required.\n");
    return 1;
  }

  const password =
    flags.password ??
    config.password ??
    (await prompt("App password (hidden): ", true));
  if (!password) {
    process.stderr.write("An app password is required.\n");
    return 1;
  }

  const session = await sessions.login({
    identifier,
    password,
    service: flags.service,
    code: flags.code,
  });
  process.stderr.write(
    `Signed in as ${session.session.handle} (${session.did}).\n` +
      `Session stored at ${config.sessionFile}.\n`,
  );
  return 0;
}

async function runLogout(): Promise<number> {
  const config = loadConfig();
  const sessions = new SessionManager(config);
  const hadSession = await sessions.logout();
  process.stderr.write(
    hadSession
      ? "Signed out; the stored session has been revoked and removed.\n"
      : "There was no stored session to sign out of.\n",
  );
  return 0;
}

async function runWhoami(): Promise<number> {
  const config = loadConfig();
  const sessions = new SessionManager(config);
  const session = await sessions.current();
  if (!session) {
    process.stderr.write("Not signed in. Run `standard-reader-mcp login`.\n");
    return 1;
  }
  process.stdout.write(
    `${session.session.handle} (${session.did}) via ${session.dispatchUrl}\n`,
  );
  return 0;
}

async function runServe(): Promise<number> {
  const server = createServer();
  await server.connect(new StdioServerTransport());

  // Stay up until the host is done with us. Two ways that happens:
  //
  //  - the protocol closes (`server.close()`, or the SDK tearing the transport
  //    down). `onclose` is a plain callback property on the SDK's Protocol
  //    class, so there is no EventTarget to listen on;
  //  - stdin reaches EOF, which is how an MCP host actually signals shutdown.
  //    `StdioServerTransport` only subscribes to `data` and `error`, so it
  //    never notices EOF on its own — without this the process would hang on
  //    an unsettled promise until it was killed.
  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
    const previous = server.server.onclose;
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    server.server.onclose = () => {
      previous?.();
      resolve();
    };
  });

  await server.close();
  return 0;
}

async function main(): Promise<number> {
  const [command = "", ...rest] = process.argv.slice(2);

  switch (command) {
    case "": {
      return runServe();
    }
    case "login": {
      return runLogin(rest);
    }
    case "logout": {
      return runLogout();
    }
    case "whoami": {
      return runWhoami();
    }
    case "--version":
    case "-v": {
      process.stdout.write(`${SERVER_VERSION}\n`);
      return 0;
    }
    case "--help":
    case "-h": {
      process.stdout.write(USAGE);
      return 0;
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
    }
  }
}

try {
  const code = await main();
  if (code !== 0) process.exitCode = code;
} catch (error) {
  process.stderr.write(`${describeError(error)}\n`);
  process.exitCode = 1;
}
