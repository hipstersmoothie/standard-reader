/**
 * Write `app.userinput.status` records for our feedback space.
 *
 * Status records are append-only ("latest `createdAt` wins" per the lexicon) and
 * are only honored when authored by the space owner or an appointed
 * `app.userinput.member`. We own the space as `standard-reader.app`, so these
 * writes land directly in our own repo — the same repo
 * {@link fetchStandardReaderDiscussionStatuses} reads back.
 *
 * Used by the feedback agent to move a discussion to `in-progress` when its PR
 * opens and `implemented` when that PR merges. See
 * `.github/workflows/feedback-agent-status.yml`.
 */
import { Client } from "@atcute/client";
import { PasswordSession } from "@atcute/password-session";

import type { FeedbackStatus } from "#/lib/userinput/space";
import {
  STANDARD_READER_SPACE_URI,
  USERINPUT_APPVIEW_BASE,
  USERINPUT_DISCUSSION_SOURCE,
  USERINPUT_LIST_DISCUSSIONS_METHOD,
} from "#/lib/userinput/space";

const STATUS_COLLECTION = "app.userinput.status";

/** The space owner's PDS. Matches `SPACE_PDS` in `#/lib/userinput/space`. */
const DEFAULT_PDS = "https://stropharia.us-west.host.bsky.network";

export interface SpaceOwnerSession {
  client: Client;
  /** DID of the authenticated space owner (used as the write `repo`). */
  repo: string;
}

/**
 * Log in as the space owner via app password. Mirrors `loginAsReaderBot` in
 * `src/server/announce/client.ts`, but with its own credentials — this is a
 * different account (`standard-reader.app`, the space owner) than the posting
 * bot, and conflating them would write statuses that userinput.app ignores.
 */
export async function loginAsSpaceOwner(): Promise<SpaceOwnerSession> {
  const identifier = process.env.USERINPUT_OWNER_IDENTIFIER;
  const password = process.env.USERINPUT_OWNER_APP_PASSWORD;
  const service = process.env.USERINPUT_OWNER_PDS_URL ?? DEFAULT_PDS;

  if (!identifier || !password) {
    throw new Error(
      "Missing space-owner credentials: set USERINPUT_OWNER_IDENTIFIER + USERINPUT_OWNER_APP_PASSWORD.",
    );
  }

  const session = await PasswordSession.login({
    service,
    identifier,
    password,
  });
  const repo = session.did;
  if (!repo) throw new Error("Space-owner login did not establish a DID.");
  return { client: new Client({ handler: session }), repo };
}

/** Slingshot record cache, as used by `src/server/atproto/fetch-record.ts`. */
const SLINGSHOT = "https://slingshot.microcosm.blue";

/**
 * A raw backlink reference. Constellation returns *references* — `{did,
 * collection, rkey}` — not full records, so the CID has to be fetched
 * separately. Mirrors `ConstellationBacklink` in
 * `src/integrations/tanstack-query/api-userinput.functions.ts`.
 */
interface ConstellationBacklink {
  did: string;
  collection: string;
  rkey: string;
}

/**
 * Resolve a discussion's strongRef from its record key.
 *
 * Discussions live in their *authors'* repos, so an rkey alone can't be turned
 * into an AT-URI — we have to find the author. Rather than trust a PR body to
 * carry the URI, we enumerate the space's discussions through constellation
 * (the same backlink index `/feedback` uses) and match on rkey. Record keys are
 * TIDs, so collisions within one space are not a practical concern.
 *
 * A status record's `subject` is a strongRef, so we then fetch the record to
 * pick up its CID.
 */
export async function resolveDiscussionByRkey(
  rkey: string,
): Promise<{ uri: string; cid: string } | undefined> {
  let cursor: string | undefined;
  do {
    const url = new URL(
      `${USERINPUT_APPVIEW_BASE}/xrpc/${USERINPUT_LIST_DISCUSSIONS_METHOD}`,
    );
    url.searchParams.set("subject", STANDARD_READER_SPACE_URI);
    url.searchParams.set("source", USERINPUT_DISCUSSION_SOURCE);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      records?: Array<ConstellationBacklink>;
      cursor?: string;
    };

    for (const link of json.records ?? []) {
      if (link.rkey !== rkey) continue;
      const cid = await fetchRecordCid(link);
      return cid
        ? { uri: `at://${link.did}/${link.collection}/${link.rkey}`, cid }
        : undefined;
    }
    cursor = json.cursor;
  } while (cursor);

  return undefined;
}

/** Fetch a record's current CID, needed to build the status strongRef. */
async function fetchRecordCid(
  ref: ConstellationBacklink,
): Promise<string | undefined> {
  const url = new URL(`${SLINGSHOT}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", ref.did);
  url.searchParams.set("collection", ref.collection);
  url.searchParams.set("rkey", ref.rkey);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { cid?: string };
  return json.cid;
}

/**
 * Append a status record moving `subject` to `state`. Idempotent enough in
 * practice: re-running writes a second record with a later `createdAt`, which
 * resolves to the same state.
 */
export async function setDiscussionStatus(
  session: SpaceOwnerSession,
  subject: { uri: string; cid: string },
  state: FeedbackStatus,
): Promise<void> {
  await session.client.post("com.atproto.repo.createRecord", {
    input: {
      repo: session.repo,
      collection: STATUS_COLLECTION,
      record: {
        $type: STATUS_COLLECTION,
        state,
        subject,
        createdAt: new Date().toISOString(),
      },
    } as never,
  });
}
