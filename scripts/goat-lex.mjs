#!/usr/bin/env node
/**
 * Runs the `goat` CLI with `.env` loaded and our lexicon-publishing credentials
 * mapped to the env vars goat expects. Mirrors `~/Documents/at-store`.
 *
 * Used to manage the app-owned `app.standard-reader.*` lexicons in `./lexicons/`:
 *   pnpm lex:lint                # goat lex lint   (validate schemas)
 *   pnpm atproto:publish-lexicons  # goat lex publish (upload to the network)
 *   node scripts/goat-lex.mjs lex status   # ad-hoc: any goat subcommand
 *
 * Publishing writes `com.atproto.lexicon.schema` records to the authenticated
 * account, which must control the `standard-reader.app` NSID authority (with the
 * matching `_lexicon.*` DNS TXT records — see `goat lex check-dns`).
 *
 * Install goat: https://github.com/bluesky-social/goat (e.g. `brew install goat`).
 */
import "dotenv/config";
import { spawn } from "node:child_process";

// Map our purpose-specific names onto goat's expected vars (goat itself also
// reads GOAT_USERNAME / GOAT_PASSWORD and ATP_USERNAME / ATP_PASSWORD).
if (!process.env.GOAT_USERNAME && process.env.LEXICON_PUBLISH_IDENTIFIER) {
  process.env.GOAT_USERNAME = process.env.LEXICON_PUBLISH_IDENTIFIER;
}
if (!process.env.GOAT_PASSWORD && process.env.LEXICON_PUBLISH_APP_PASSWORD) {
  process.env.GOAT_PASSWORD = process.env.LEXICON_PUBLISH_APP_PASSWORD;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "usage: node scripts/goat-lex.mjs <goat args…>  e.g. node scripts/goat-lex.mjs lex publish",
  );
  process.exit(1);
}

const child = spawn("goat", args, {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(
      "`goat` CLI not found. Install it first: https://github.com/bluesky-social/goat (e.g. `brew install goat`).",
    );
    process.exit(127);
  }
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
