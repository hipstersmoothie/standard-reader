/**
 * Post → send trigger. Finds published documents that haven't been mailed yet
 * (no newsletter_sends row), reserves each one (at-most-once), and sends it to
 * the publication's confirmed subscribers. Idempotent: the `isNull` filter plus
 * the reservation mean a document is mailed exactly once even across concurrent
 * or repeated runs. Drive it from a cron (the CLI at scripts/dispatch-sends.ts).
 */

import { and, eq, isNull } from "drizzle-orm";

import {
  documents,
  newsletterSends,
  publications,
} from "@standard-reader/db/schema";

import { getDb } from "../../db/index.server";
import { toStandardSiteDocument } from "@standard-reader/renderer-email";

import { reserveSend } from "../send-events.server";
import { loadConfirmedSubscribers } from "../subscribers.server";
import { previewText } from "./document-content";
import { sendNewsletter } from "./send-newsletter";

export interface DispatchResult {
  documentUri: string;
  title: string;
  outcome: "sent" | "no-subscribers" | "already-reserved";
  delivered?: number;
  total?: number;
}

function canonicalUrlFor(
  canonical: string | null,
  pubUrl: string,
  path: string | null,
): string {
  if (canonical) return canonical;
  const base = pubUrl.replace(/\/+$/, "");
  return path ? `${base}/${path.replace(/^\/+/, "")}` : base;
}

export async function dispatchPendingSends(
  opts: { publicationUri?: string; limit?: number } = {},
): Promise<DispatchResult[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      uri: documents.uri,
      title: documents.title,
      textContent: documents.textContent,
      contentJson: documents.contentJson,
      contentFormat: documents.contentFormat,
      did: documents.did,
      description: documents.description,
      canonicalUrl: documents.canonicalUrl,
      path: documents.path,
      publicationUri: documents.publicationUri,
      pubName: publications.name,
      pubUrl: publications.url,
    })
    .from(documents)
    .innerJoin(publications, eq(publications.uri, documents.publicationUri))
    .leftJoin(newsletterSends, eq(newsletterSends.id, documents.uri))
    .where(
      and(
        eq(documents.deleted, false),
        isNull(newsletterSends.id),
        opts.publicationUri
          ? eq(documents.publicationUri, opts.publicationUri)
          : undefined,
      ),
    )
    .orderBy(documents.publishedAt)
    .limit(opts.limit ?? 20);

  const results: DispatchResult[] = [];
  for (const doc of rows) {
    if (!doc.publicationUri) continue;

    const subscribers = await loadConfirmedSubscribers(doc.publicationUri);
    if (subscribers.length === 0) {
      results.push({
        documentUri: doc.uri,
        title: doc.title,
        outcome: "no-subscribers",
      });
      continue;
    }

    // Claim the send first so a concurrent dispatcher can't also mail it.
    const reserved = await reserveSend({
      id: doc.uri,
      publicationUri: doc.publicationUri,
      documentUri: doc.uri,
      subject: doc.title,
      recipientCount: subscribers.length,
    });
    if (!reserved) {
      results.push({
        documentUri: doc.uri,
        title: doc.title,
        outcome: "already-reserved",
      });
      continue;
    }

    const report = await sendNewsletter(
      {
        publicationUri: doc.publicationUri,
        documentUri: doc.uri,
        publicationName: doc.pubName,
        title: doc.title,
        preview: previewText(doc.textContent),
        canonicalUrl: canonicalUrlFor(doc.canonicalUrl, doc.pubUrl, doc.path),
        document: toStandardSiteDocument({
          contentJson: doc.contentJson,
          contentFormat: doc.contentFormat,
          authorDid: doc.did,
          description: doc.description,
        }),
        textContent: doc.textContent,
      },
      subscribers,
    );
    results.push({
      documentUri: doc.uri,
      title: doc.title,
      outcome: "sent",
      delivered: report.delivered,
      total: report.total,
    });
  }
  return results;
}
