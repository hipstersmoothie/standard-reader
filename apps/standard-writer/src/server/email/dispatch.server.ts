/**
 * Post → send trigger. Finds published documents of **connected** publications
 * that haven't been mailed yet (no newsletter_sends row), reserves each one
 * (at-most-once), and sends it to the publication's confirmed subscribers. Idempotent: the `isNull` filter plus
 * the reservation mean a document is mailed exactly once even across concurrent
 * or repeated runs. Drive it from a cron (the CLI at scripts/dispatch-sends.ts).
 */

import {
  documents,
  newsletterPublications,
  newsletterSends,
  publications,
} from "@standard-reader/db/schema";
import { toStandardSiteDocument } from "@standard-reader/renderer-email";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import { reserveSend } from "../send-events.server";
import { loadConfirmedSubscribers } from "../subscribers.server";
import { emailConfig } from "./config";
import { previewText } from "./document-content";
import { sendNewsletter } from "./send-newsletter";

export interface DispatchResult {
  documentUri: string;
  title: string;
  outcome: "sent" | "no-subscribers" | "already-reserved";
  delivered?: number;
  total?: number;
}

/**
 * The public URL for a sent post: an explicit canonical wins; otherwise join the
 * publication origin and the post path, tolerating slashes on either side.
 * Exported for tests.
 */
export function canonicalUrlFor(
  canonical: string | null,
  pubUrl: string,
  path: string | null,
): string {
  if (canonical) return canonical;
  const base = pubUrl.replace(/\/+$/, "");
  return path ? `${base}/${path.replace(/^\/+/, "")}` : base;
}

/**
 * The `"Name <addr>"` From identity for a send: the publication's own override
 * when set, each field falling back independently to the instance default. A
 * per-newsletter address must be on a verified Resend domain — validated when
 * it's saved, not here.
 */
export function fromIdentity(
  fromName: string | null,
  fromAddress: string | null,
): string {
  const name = fromName?.trim() || emailConfig.defaultFromName;
  const address = fromAddress?.trim() || emailConfig.defaultFrom;
  return `${name} <${address}>`;
}

export async function dispatchPendingSends(
  opts: { publicationUri?: string; limit?: number } = {},
): Promise<Array<DispatchResult>> {
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
      fromName: newsletterPublications.fromName,
      fromAddress: newsletterPublications.fromAddress,
    })
    .from(documents)
    .innerJoin(publications, eq(publications.uri, documents.publicationUri))
    // Only connected publications are mailed. Without this join the dispatcher
    // would mail posts from every publication in the shared reader DB — the
    // author's opt-in is what makes a publication a newsletter.
    .innerJoin(
      newsletterPublications,
      eq(newsletterPublications.publicationUri, documents.publicationUri),
    )
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

  const results: Array<DispatchResult> = [];
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
        from: fromIdentity(doc.fromName, doc.fromAddress),
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
