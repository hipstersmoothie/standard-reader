/**
 * Author-side bulk email import: merge a batch of addresses into the author's
 * own `subscriberList` space record (the atproto-native list they hold) and
 * mirror the active ones as confirmed rows for the send path. Runs with the
 * signed-in author's session; config-gated on HappyView.
 */

import {
  chunkListEntries,
  emptySubscriberList,
  mergeEmailsIntoList,
  SUBSCRIBER_LIST_COLLECTION,
} from "../../lexicons/newsletter";
import type { SubscriberListRecord } from "../../lexicons/newsletter";
import { dpopTransport, HappyViewError } from "./client";
import type { DpopFetch } from "./client";
import { getHappyViewConfig } from "./config";
import { spaceUri } from "./space-uri";
import { ensureSpaceExists, getRecord, putRecord } from "./spaces";

export interface AuthorSession {
  did: string;
  handle: (pathname: string, init?: RequestInit) => Promise<Response>;
}

function publicationParts(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}

function sessionFetch(session: AuthorSession): DpopFetch {
  return (url, init) =>
    session.handle(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
}

/** Parse addresses from free text (commas, whitespace, or newlines). */
export function parseEmails(text: string): Array<string> {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/**
 * Import emails into the author's subscriberList record and mirror. Returns the
 * number of active addresses after the merge, or a skip reason.
 */
export async function importEmails(input: {
  session: AuthorSession;
  publicationUri: string;
  emails: Array<string>;
  /** Publication name — the space's display name when it's first created. */
  spaceName?: string;
}): Promise<{ ok: boolean; count?: number; skipped?: string }> {
  const parts = publicationParts(input.publicationUri);
  if (!parts) return { ok: false, skipped: "bad-publication" };

  const config = getHappyViewConfig();
  if (!config) {
    // No HappyView instance: skip the author-owned space record and write the
    // addresses straight into the send read model. The subscriber list then
    // lives only in `newsletter_subscribers` rather than the author's repo —
    // less portable, but import still works and posts still go out. Standing up
    // HappyView later backfills the space record on the next sync.
    const { upsertMirrorRows } = await import("./mirror.server");
    await upsertMirrorRows(
      input.publicationUri,
      input.emails.map((email) => ({
        email,
        source: "email" as const,
        status: "confirmed" as const,
      })),
    );
    return { ok: true, count: input.emails.length };
  }

  const uri = spaceUri({
    did: parts.did,
    type: config.spaceType,
    skey: parts.rkey,
  });
  const transport = dpopTransport(sessionFetch(input.session));
  const now = new Date().toISOString();

  // Each newsletter is a private space owned by the author: only they (the
  // write member) see the full member list and all records; subscribers only
  // ever know their own membership. `public` mint keeps signup open. Idempotent,
  // so importing again just reuses the space.
  await ensureSpaceExists(transport, config, {
    type: config.spaceType,
    skey: parts.rkey,
    displayName: input.spaceName
      ? `${input.spaceName} subscribers`
      : "Newsletter subscribers",
    mintPolicy: "public",
    membershipPublic: false,
    recordsPublic: false,
  });

  // Load the current list (empty if it doesn't exist yet).
  let list: SubscriberListRecord;
  try {
    const existing = await getRecord(
      transport,
      config,
      { kind: "dpop" },
      {
        space: uri,
        collection: SUBSCRIBER_LIST_COLLECTION,
        rkey: "self",
      },
    );
    list = existing.value as SubscriberListRecord;
    if (!Array.isArray(list?.entries)) {
      list = emptySubscriberList(input.publicationUri, now);
    }
  } catch (error) {
    if (error instanceof HappyViewError && error.status === 404) {
      list = emptySubscriberList(input.publicationUri, now);
    } else {
      throw error;
    }
  }

  const merged = mergeEmailsIntoList(list, input.emails, now);

  // Write the (possibly chunked) record(s) back to the author's repo.
  for (const chunk of chunkListEntries(merged.entries)) {
    await putRecord(transport, config, {
      space: uri,
      collection: SUBSCRIBER_LIST_COLLECTION,
      rkey: chunk.rkey,
      record: {
        $type: SUBSCRIBER_LIST_COLLECTION,
        publicationUri: input.publicationUri,
        entries: chunk.entries,
        updatedAt: now,
      },
    });
  }

  // Mirror the active addresses as confirmed email rows for the send path.
  const active = merged.entries.filter((e) => !e.unsubscribedAt);
  const { upsertMirrorRows } = await import("./mirror.server");
  await upsertMirrorRows(
    input.publicationUri,
    active.map((e) => ({
      email: e.email,
      source: "email" as const,
      status: "confirmed" as const,
    })),
  );

  return { ok: true, count: active.length };
}
