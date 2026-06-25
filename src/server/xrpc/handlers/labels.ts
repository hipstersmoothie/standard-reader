import { fetchSubscribedLabels } from "#/server/labeler/labels.server";
import {
  resolveActorDid,
  resolveLabelerView,
} from "#/server/labeler/resolve.server";
import { and, eq } from "drizzle-orm";

import type { XrpcRequestContext } from "../types";

import { requireParam } from "../params";

/** The labeler DIDs the caller is subscribed to (empty when signed out). */
async function subscribedDids(ctx: XrpcRequestContext): Promise<Array<string>> {
  const did = ctx.auth?.did;
  if (!did) return [];
  const ls = ctx.schema.labelerSubscriptions;
  const rows = await ctx.db
    .selectDistinct({ labelerDid: ls.labelerDid })
    .from(ls)
    .where(and(eq(ls.subscriberDid, did), eq(ls.deleted, false)));
  return rows.map((r) => r.labelerDid);
}

/**
 * `app.standard-reader.getLabelers` — the caller's subscribed labelers, each
 * resolved live to a labeler view. Discovered the standard way (DID document →
 * `#atproto_labeler` service → descriptor); nothing is hardcoded.
 */
export async function handleGetLabelers(ctx: XrpcRequestContext) {
  const dids = await subscribedDids(ctx);
  const views = await Promise.all(dids.map((did) => resolveLabelerView(did)));
  const labelers = dids.map((did, i) => views[i] ?? { did });
  return { labelers };
}

/**
 * `app.standard-reader.getLabeler` — resolve a single labeler by DID or handle
 * (for previewing before subscribing), with the caller's subscription state.
 */
export async function handleGetLabeler(ctx: XrpcRequestContext) {
  const actor = requireParam(ctx.params, "actor");
  const did = await resolveActorDid(actor);
  if (!did) return { labeler: null, subscribed: false };

  const view = (await resolveLabelerView(did)) ?? { did };
  let subscribed = false;
  if (ctx.auth?.did) {
    const ls = ctx.schema.labelerSubscriptions;
    const [row] = await ctx.db
      .select({ uri: ls.uri })
      .from(ls)
      .where(
        and(
          eq(ls.subscriberDid, ctx.auth.did),
          eq(ls.labelerDid, did),
          eq(ls.deleted, false),
        ),
      )
      .limit(1);
    subscribed = Boolean(row);
  }
  return { labeler: view, subscribed };
}

/** `app.standard-reader.getLabels` — labels for subjects from subscribed labelers. */
export async function handleGetLabels(ctx: XrpcRequestContext) {
  const did = ctx.auth?.did;
  if (!did) return { labels: [] };
  const uris = new URL(ctx.request.url).searchParams
    .getAll("uris")
    .slice(0, 100);
  const labels = await fetchSubscribedLabels(ctx.db, ctx.schema, did, uris);
  return { labels };
}
