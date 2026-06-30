/**
 * Register the first-party labelers by publishing `app.standard-reader.labeler.service`
 * records into the operator's account. Tap then indexes them into `labeler_services`,
 * which drives the Labelers directory. The label servers stay dumb.
 *
 *   pnpm register-labelers
 *
 * Auth: the operator's account, via app password (reuses the PERF_TEST_* creds):
 *   PERF_TEST_IDENTIFIER, PERF_TEST_APP_PASSWORD, PERF_TEST_PDS_URL (default bsky.social).
 *
 * Endpoints/DIDs default to prod; override per labeler with env (e.g.
 * CLAUDESLOP_DID / CLAUDESLOP_URL) to register against local servers. Idempotent:
 * re-running updates the existing record for each labeler (matched by `did`).
 */

import { Client } from "@atcute/client";
import { PasswordSession } from "@atcute/password-session";
import { APP_NSID } from "#/lib/atproto/nsids";
import {
  listCollectionRecords,
  newListRkey,
  putLabelerServiceRecord,
  uploadBlob,
} from "#/server/atproto/repo-records";
import { readFileSync } from "node:fs";

interface LabelerReg {
  did: string;
  serviceEndpoint: string;
  displayName: string;
  description: string;
  avatarPath: string;
  policies: {
    labelValues: Array<string>;
    labelValueDefinitions: Array<Record<string, unknown>>;
  };
}

function def(
  identifier: string,
  name: string,
  description: string,
): Record<string, unknown> {
  return {
    identifier,
    severity: "inform",
    blurs: "none",
    defaultSetting: "warn",
    adultOnly: false,
    locales: [{ lang: "en", name, description }],
  };
}

const LABELERS: Array<LabelerReg> = [
  {
    did: process.env.CLAUDESLOP_DID ?? "did:web:claudeslop.standard-reader.app",
    serviceEndpoint:
      process.env.CLAUDESLOP_URL ?? "https://claudeslop.standard-reader.app",
    displayName: "claudeslop",
    description:
      "Flags prose that a heuristic detector thinks reads like AI slop. A vibe check, not proof.",
    avatarPath: "services/claudeslop/avatar.svg",
    policies: {
      labelValues: ["ai-writing"],
      labelValueDefinitions: [
        def(
          "ai-writing",
          "AI writing",
          "claudeslop's heuristic detector scored this document as likely AI-generated prose. An informational vibe check, not proof of authorship.",
        ),
      ],
    },
  },
  {
    did: process.env.BOTLABELER_DID ?? "did:web:botlabeler.standard-reader.app",
    serviceEndpoint:
      process.env.BOTLABELER_URL ?? "https://botlabeler.standard-reader.app",
    displayName: "Bots",
    description:
      "Labels posts from accounts that have declared themselves bots (a `bot` self-label on their profile).",
    avatarPath: "services/botlabeler/avatar.svg",
    policies: {
      labelValues: ["bot"],
      labelValueDefinitions: [
        def(
          "bot",
          "Bot",
          "This post is from an account that has self-declared as a bot / automated account.",
        ),
      ],
    },
  },
];

async function main(): Promise<void> {
  const identifier = process.env.PERF_TEST_IDENTIFIER;
  const password = process.env.PERF_TEST_APP_PASSWORD;
  const service = process.env.PERF_TEST_PDS_URL || "https://bsky.social";
  if (!identifier || !password) {
    throw new Error(
      "PERF_TEST_IDENTIFIER and PERF_TEST_APP_PASSWORD are required.",
    );
  }

  const session = await PasswordSession.login({
    service,
    identifier,
    password,
  });
  const client = new Client({ handler: session });
  const repo = session.did;
  if (!repo) throw new Error("Login did not establish a session DID.");
  console.log(`[register] signed in as ${repo} (${service})`);

  const existing = await listCollectionRecords(
    client,
    repo,
    APP_NSID.labelerService,
  );
  const rkeyByDid = new Map<string, string>();
  for (const rec of existing) {
    const did = (rec.value as { did?: string })?.did;
    if (did) rkeyByDid.set(did, rec.rkey);
  }

  for (const labeler of LABELERS) {
    const bytes = new Uint8Array(readFileSync(labeler.avatarPath));
    const avatar = await uploadBlob(client, bytes, "image/svg+xml");
    const rkey = rkeyByDid.get(labeler.did) ?? newListRkey();
    const { uri } = await putLabelerServiceRecord(client, repo, rkey, {
      did: labeler.did,
      serviceEndpoint: labeler.serviceEndpoint,
      displayName: labeler.displayName,
      description: labeler.description,
      avatar,
      policies: labeler.policies,
      createdAt: new Date().toISOString(),
    });
    console.log(`[register] ${labeler.did} → ${uri}`);
  }

  console.log("[register] done.");
}

try {
  await main();
} catch (error) {
  console.error("[register] fatal", error);
  process.exitCode = 1;
}
