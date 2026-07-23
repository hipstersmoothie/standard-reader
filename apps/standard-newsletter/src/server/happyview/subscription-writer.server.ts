/**
 * Member-side writes to a publication's permissioned space: a Bluesky
 * subscriber creating (or deleting) their own subscription record with their own
 * session, plus the matching mirror update. Config-gated and best-effort — the
 * email path never depends on it. Verified against a live HappyView instance.
 */

import {
  buildSubscriptionRecord,
  SUBSCRIPTION_COLLECTION,
} from "../../lexicons/newsletter";
import { dpopTransport } from "./client";
import type { DpopFetch } from "./client";
import { getHappyViewConfig } from "./config";
import { spaceUri } from "./space-uri";
import { createRecord, deleteRecord } from "./spaces";

/** The minimal atcute-session surface we need (a DPoP fetch handler). */
export interface DpopSession {
  did: string;
  handle: (pathname: string, init?: RequestInit) => Promise<Response>;
}

function publicationParts(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}

function sessionFetch(session: DpopSession): DpopFetch {
  return (url, init) =>
    session.handle(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
}

/**
 * Write a Bluesky subscriber's subscription record into their own space repo and
 * mirror a confirmed row. Returns the record URI, or a skip reason. Errors from
 * HappyView propagate so the caller can surface them.
 */
export async function writeBlueskySubscription(input: {
  session: DpopSession;
  publicationUri: string;
  email: string;
}): Promise<{ ok: boolean; recordUri?: string; skipped?: string }> {
  const config = getHappyViewConfig();
  if (!config) return { ok: false, skipped: "no-happyview" };
  const parts = publicationParts(input.publicationUri);
  if (!parts) return { ok: false, skipped: "bad-publication" };

  const uri = spaceUri({
    did: parts.did,
    type: config.spaceType,
    skey: parts.rkey,
  });
  const transport = dpopTransport(sessionFetch(input.session));
  const created = await createRecord(transport, config, {
    space: uri,
    collection: SUBSCRIPTION_COLLECTION,
    record: buildSubscriptionRecord({
      publicationUri: input.publicationUri,
      email: input.email,
      createdAt: new Date().toISOString(),
    }),
  });

  const { upsertMirrorRows } = await import("./mirror.server");
  await upsertMirrorRows(input.publicationUri, [
    {
      email: input.email.trim().toLowerCase(),
      subscriberDid: input.session.did,
      source: "space",
      spaceRecordUri: created.uri,
      status: "confirmed",
    },
  ]);

  return { ok: true, recordUri: created.uri };
}

/**
 * Delete a Bluesky subscriber's own subscription record (their native
 * unsubscribe) and flip the mirror row to unsubscribed.
 */
export async function deleteBlueskySubscription(input: {
  session: DpopSession;
  publicationUri: string;
  rkey: string;
}): Promise<{ ok: boolean; skipped?: string }> {
  const config = getHappyViewConfig();
  if (!config) return { ok: false, skipped: "no-happyview" };
  const parts = publicationParts(input.publicationUri);
  if (!parts) return { ok: false, skipped: "bad-publication" };

  const uri = spaceUri({
    did: parts.did,
    type: config.spaceType,
    skey: parts.rkey,
  });
  const transport = dpopTransport(sessionFetch(input.session));
  await deleteRecord(transport, config, {
    space: uri,
    collection: SUBSCRIPTION_COLLECTION,
    rkey: input.rkey,
  });

  const { markMirrorUnsubscribedByDid } = await import("./mirror.server");
  await markMirrorUnsubscribedByDid(input.publicationUri, input.session.did);
  return { ok: true };
}
