/**
 * Reconcile a publication's permissioned space into the Postgres
 * `newsletter_subscribers` mirror — the send pipeline's read model (the repo's
 * "DB is the read model; don't read the network at send time" principle).
 *
 * The fold from space ops → desired mirror rows (`reconcileSpaceOps`) is pure
 * and unit-tested. `syncSpaceToMirror` wires it to the author's session, the
 * cross-service credential flow, and the DB; that orchestration is only
 * exercised against a live HappyView instance.
 */

import {
  SUBSCRIBER_LIST_COLLECTION,
  SUBSCRIPTION_COLLECTION,
} from "../../lexicons/newsletter";
import type { SubscriberListEntry } from "../../lexicons/newsletter";
import { spaceRecordUri } from "./space-uri";
import type { SpaceRef } from "./space-uri";
import type { RepoOp } from "./spaces";

export interface DesiredSubscriber {
  email: string;
  subscriberDid?: string;
  source: "email" | "space";
  spaceRecordUri?: string;
  status: "confirmed" | "unsubscribed";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface SubscriptionValue {
  email?: unknown;
}

interface SubscriberListValue {
  entries?: unknown;
}

function asEntry(value: unknown): SubscriberListEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.email !== "string" || typeof e.addedAt !== "string") return null;
  return {
    email: e.email,
    addedAt: e.addedAt,
    unsubscribedAt:
      typeof e.unsubscribedAt === "string" ? e.unsubscribedAt : undefined,
  };
}

/**
 * Fold space record ops into the desired mirror rows. Latest op per (author,
 * collection, rkey) wins; `subscription` records become `space` subscribers,
 * the author's `subscriberList` record expands into `email` subscribers, and a
 * deleted subscription becomes an `unsubscribed` row.
 */
export function reconcileSpaceOps(
  ops: Array<RepoOp>,
  space: SpaceRef,
): Array<DesiredSubscriber> {
  // Latest op wins per record identity (ops arrive oldest to newest). A delete
  // op carries no inlined value, so keep the last-seen value alongside the
  // latest action — otherwise a create-then-delete loses the email.
  const latest = new Map<string, { op: RepoOp; value: unknown }>();
  for (const op of ops) {
    if (
      op.collection !== SUBSCRIPTION_COLLECTION &&
      op.collection !== SUBSCRIBER_LIST_COLLECTION
    ) {
      continue;
    }
    const key = [op.collection, op.did, op.rkey].join("|");
    const prev = latest.get(key);
    latest.set(key, { op, value: op.value ?? prev?.value });
  }

  const byEmail = new Map<string, DesiredSubscriber>();
  const put = (sub: DesiredSubscriber) => {
    const key = normalizeEmail(sub.email);
    if (!key) return;
    // A confirmed row wins over an unsubscribed one for the same address.
    const existing = byEmail.get(key);
    if (existing && existing.status === "confirmed") return;
    byEmail.set(key, { ...sub, email: key });
  };

  for (const { op, value } of latest.values()) {
    if (op.collection === SUBSCRIPTION_COLLECTION) {
      const email = (value as SubscriptionValue | undefined)?.email;
      if (typeof email !== "string") continue;
      put({
        email,
        subscriberDid: op.did,
        source: "space",
        spaceRecordUri: spaceRecordUri({
          ...space,
          author: op.did,
          collection: op.collection,
          rkey: op.rkey,
        }),
        status: op.action === "delete" ? "unsubscribed" : "confirmed",
      });
    } else {
      // subscriberList: a deleted list record contributes no entries.
      if (op.action === "delete") continue;
      const raw = (value as SubscriberListValue | undefined)?.entries;
      if (!Array.isArray(raw)) continue;
      for (const item of raw) {
        const entry = asEntry(item);
        if (!entry) continue;
        put({
          email: entry.email,
          source: "email",
          status: entry.unsubscribedAt ? "unsubscribed" : "confirmed",
        });
      }
    }
  }

  return [...byEmail.values()];
}

/**
 * Sync a publication's space into the mirror. Best-effort and config-gated:
 * no-op when HappyView is unconfigured. Wires the author's OAuth session to the
 * two-step credential flow, pages `listRepoOps`, reconciles, and upserts the
 * `newsletter_subscribers` rows. Verified against a live instance (runbook).
 */
export async function syncSpaceToMirror(publicationUri: string): Promise<{
  synced: number;
  skipped?: "no-happyview" | "no-db" | "no-session";
}> {
  const [{ getHappyViewConfig }, { getDb }] = await Promise.all([
    import("./config"),
    import("../../db/index.server"),
  ]);
  const config = getHappyViewConfig();
  if (!config) return { synced: 0, skipped: "no-happyview" };
  const db = getDb();
  if (!db) return { synced: 0, skipped: "no-db" };

  const { readSpaceForPublication } = await import("./read-space.server");
  const desired = await readSpaceForPublication(publicationUri, config);
  if (desired === null) return { synced: 0, skipped: "no-session" };

  const { upsertMirrorRows } = await import("./mirror.server");
  await upsertMirrorRows(publicationUri, desired);
  return { synced: desired.length };
}
