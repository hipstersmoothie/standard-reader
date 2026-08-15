import type { Client } from "@atcute/client";
import type { Did } from "@atcute/lexicons";

import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { articleCardsAsAllRead } from "#/lib/track-reading-history";
import type { AtprotoSessionContext } from "#/middleware/auth-session.server";
import { parseAtUri } from "#/server/atproto/uri";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";

import type { XrpcAuthContext } from "../auth";
import { decodeCursor, nextCursor } from "../db";
import { AuthRequiredError, InvalidRequestError } from "../errors";
import type { XrpcRequestContext } from "../types";
import { toDocumentView, toPublicationView } from "../views";

export function requireAuthClient(
  ctx: XrpcRequestContext,
): XrpcAuthContext & { client: Client; did: Did } {
  if (!ctx.auth?.client) {
    // A PDS-proxied caller authenticates fine but arrives with no PDS client:
    // the service JWT proves who they are, yet carries no credential we could
    // write to their repo with. A bare 401 here read as "your token is
    // invalid" to external developers — say what is actually unsupported.
    if (ctx.auth?.via === "serviceJwt") {
      throw new InvalidRequestError(
        "This procedure writes to your repo, which a proxied service JWT cannot authorize. " +
          "Call the AppView directly with your own access token instead of via atproto-proxy.",
      );
    }
    // Same shape for a self-verified OAuth JWT: DPoP binds the token to the
    // caller's key, so the AppView cannot replay it against their PDS.
    if (ctx.auth?.via === "oauthJwt") {
      throw new InvalidRequestError(
        "This procedure writes to your repo, and your DPoP-bound token cannot be replayed there by the AppView. " +
          "Write the app.standard-reader.* record to your own repo instead (it is mirrored within seconds), " +
          "or authenticate with an app password.",
      );
    }
    throw new AuthRequiredError("Authentication required");
  }
  return ctx.auth as XrpcAuthContext & { client: Client; did: Did };
}

export function authSessionFromContext(
  auth: XrpcAuthContext | null,
): AtprotoSessionContext | undefined {
  if (!auth) return undefined;
  return { did: auth.did } as AtprotoSessionContext;
}

export function parseListRef(listUri: string): { did: string; rkey: string } {
  const parsed = parseAtUri(listUri);
  if (!parsed) {
    throw new InvalidRequestError("Invalid list AT-URI");
  }
  return { did: parsed.did, rkey: parsed.rkey };
}

export function mapPublicationPage(
  items: Array<PublicationCard>,
  offset: number,
  limit: number,
  total: number,
) {
  return {
    cursor: nextCursor(offset, limit, total),
    items: items.map((item) => toPublicationView(item)),
  };
}

export function mapDocumentPage(
  items: Array<ArticleCard>,
  offset: number,
  limit: number,
  total: number,
) {
  return {
    cursor: nextCursor(offset, limit, total),
    items: items.map((item) => toDocumentView(item)),
  };
}

export function mapDocumentList(items: Array<ArticleCard>) {
  return items.map((item) => toDocumentView(item));
}

export async function enrichDocuments(
  ctx: XrpcRequestContext,
  items: Array<ArticleCard>,
  readForDid?: string,
) {
  const trackReading = readForDid == null ? false : ctx.trackReadingEnabled;
  const normalized =
    trackReading || readForDid == null ? items : articleCardsAsAllRead(items);
  const enriched = await attachCommentCountsToArticles(
    ctx.db,
    ctx.schema,
    normalized,
  );
  return enriched;
}

export function paginationFromCursor(
  params: Record<string, string | undefined>,
  defaultLimit: number,
  maxLimit: number,
) {
  const offset = decodeCursor(params.cursor);
  const limitRaw = params.limit
    ? Number.parseInt(params.limit, 10)
    : defaultLimit;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), maxLimit)
    : defaultLimit;
  return { offset, limit };
}

export function homeScopeFromParam(
  scope: string | undefined,
): "follows" | "network" {
  return scope === "all" ? "network" : "follows";
}

export function latestFilterFromParam(
  filter: string | undefined,
): "unread" | "subscriptions" | "all" | "trending" {
  if (
    filter === "unread" ||
    filter === "subscriptions" ||
    filter === "all" ||
    filter === "trending"
  ) {
    return filter;
  }
  return "subscriptions";
}

export function trendingScopeFromParam(
  scope: string | undefined,
): "rail" | "page" {
  return scope === "page" ? "page" : "rail";
}

export function directorySortFromParam(
  sort: string | undefined,
): "readers" | "active" | "az" {
  if (sort === "active" || sort === "az") return sort;
  return "readers";
}

export function tagSortFromParam(
  sort: string | undefined,
): "tagged" | "readers" | "active" | "az" {
  if (sort === "tagged" || sort === "active" || sort === "az") return sort;
  return "readers";
}
