/**
 * Server-only: read publications, their subscriber counts, and their published
 * posts from the shared Standard Reader database and shape them for the
 * analytics UI.
 *
 * Everything here is real. Names, URLs, descriptions, and themes come from the
 * reader's `publications`; the **subscriber count is the newsletter's own email
 * list** (`newsletter_subscribers`, confirmed rows) — deliberately NOT the
 * standard.site follower count in `publication_stats`, which is a different
 * audience. Delivery metrics (opens/clicks/unsubscribes/bounces, recipients)
 * come from the send pipeline via `loadSendMetrics`. Nothing is fabricated — a
 * post that hasn't been mailed contributes no `Send`, so a publication with no
 * sends reports zeros and empty states rather than invented numbers. The read
 * model has no historical subscriber-growth series, so `growth` is empty until
 * such a timeseries exists.
 */

import {
  documents,
  newsletterPublications,
  newsletterSubscribers,
  publications,
} from "@standard-reader/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Publication, PublicationTheme, Send } from "../data/publications";
import { getDb } from "../db/index.server";
import { publicationIconUrl } from "../lib/blob";
import { PALETTE } from "../theme-palette";
import { loadSendMetrics } from "./send-events.server";
import type { DocSendMetrics } from "./send-events.server";

export interface PublicationSummary {
  uri: string;
  id: string;
  name: string;
  description: string;
  theme: PublicationTheme;
}

/**
 * Public, unscoped lookup of one publication by rkey (for the subscribe page).
 *
 * Joins `newsletter_publications`, so a publication the author has not
 * connected has no subscribe page — there is nothing to sign up for, and
 * offering a form would promise mail that never arrives.
 */
export async function loadPublicationSummary(
  rkey: string,
): Promise<PublicationSummary | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      uri: publications.uri,
      rkey: publications.rkey,
      name: publications.name,
      description: publications.description,
      themeAccent: publications.themeAccent,
      themeBackground: publications.themeBackground,
      themeForeground: publications.themeForeground,
      themeAccentForeground: publications.themeAccentForeground,
    })
    .from(publications)
    .innerJoin(
      newsletterPublications,
      eq(newsletterPublications.publicationUri, publications.uri),
    )
    .where(and(eq(publications.rkey, rkey), eq(publications.deleted, false)))
    .limit(1);
  if (!row) return null;
  return {
    uri: row.uri,
    id: row.rkey,
    name: row.name,
    description: row.description ?? "",
    theme: {
      background: row.themeBackground ?? DEFAULT_THEME.background,
      foreground: row.themeForeground ?? DEFAULT_THEME.foreground,
      accent: row.themeAccent ?? DEFAULT_THEME.accent,
      accentForeground:
        row.themeAccentForeground ?? DEFAULT_THEME.accentForeground,
    },
  };
}

/**
 * Fallback for publications whose theme columns are null. These are concrete
 * colors, not CSS variables: they are stored/served as data and also end up in
 * email HTML, where `var()` does not resolve. Sourced from the editorial hex
 * mirror so an unthemed publication matches the site.
 */
const DEFAULT_THEME = {
  background: PALETTE.card,
  foreground: PALETTE.ink,
  accent: PALETTE.accent,
  accentForeground: PALETTE.accentForeground,
};

/** Rate as a percentage rounded to one decimal (0.1234 → 12.3). */
function round1(n: number): number {
  return Math.round(n * 1000) / 10;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function formatWhen(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/**
 * Human cadence from the intervals between real sends. Needs at least two sends
 * to have an interval at all; returns "" otherwise so the UI can omit it rather
 * than guess a schedule from a single (or zero) mailing.
 */
function cadenceFromSends(sentAtMs: Array<number>): string {
  if (sentAtMs.length < 2) return "";
  const sorted = [...sentAtMs].toSorted((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < sorted.length; i++) total += sorted[i] - sorted[i - 1];
  const avgDays = total / (sorted.length - 1) / 86_400_000;
  if (avgDays <= 10) return "Weekly";
  if (avgDays <= 20) return "Biweekly";
  return "Monthly";
}

/**
 * A `Send` is a post that was actually mailed. Built entirely from its recorded
 * delivery metrics — there is no placeholder branch, so a post that hasn't been
 * sent simply isn't a send (see the caller, which drops docs without metrics).
 */
function toSend(doc: DocRow, metrics: DocSendMetrics): Send {
  const denom = metrics.delivered || metrics.recipients || 1;
  return {
    title: doc.title,
    path: doc.path ?? doc.rkey,
    subject: doc.description ?? doc.title,
    when: formatWhen(metrics.sentAt),
    sentAtMs: metrics.sentAt.getTime(),
    recipients: metrics.recipients,
    openRate: round1(metrics.opens / denom),
    clickRate: round1(metrics.clicks / denom),
    unsubs: metrics.unsubs,
    bounces: metrics.bounces,
    delivered: metrics.delivered,
    opensByHour: metrics.opensByHour,
    topLinks: metrics.topLinks,
  };
}

interface DocRow {
  uri: string;
  rkey: string;
  title: string;
  path: string | null;
  description: string | null;
  publishedAt: Date;
}

/**
 * Load the **connected** publications — those the author opted in to mailing —
 * with real identity, subscriber counts, and posts. Scoped to one author when
 * `ownerDid` is given; unscoped for the marketing home's showcase rail.
 *
 * Owning a publication is not enough: it appears here only once connected (see
 * `newsletter_publications`), which is why a first-time account sees nothing.
 * Returns `null` when no DB is configured; the caller surfaces that as an error.
 */
export async function loadPublicationsFromDb(
  ownerDid?: string,
): Promise<Publication[] | null> {
  const db = getDb();
  if (!db) return null;

  const whereClause = ownerDid
    ? and(eq(publications.deleted, false), eq(publications.did, ownerDid))
    : eq(publications.deleted, false);

  const pubRows = await db
    .select({
      uri: publications.uri,
      rkey: publications.rkey,
      did: publications.did,
      name: publications.name,
      url: publications.url,
      description: publications.description,
      iconCid: publications.iconCid,
      themeAccent: publications.themeAccent,
      themeBackground: publications.themeBackground,
      themeForeground: publications.themeForeground,
      themeAccentForeground: publications.themeAccentForeground,
    })
    .from(publications)
    .innerJoin(
      newsletterPublications,
      eq(newsletterPublications.publicationUri, publications.uri),
    )
    .where(whereClause)
    .orderBy(desc(newsletterPublications.connectedAt))
    .limit(50);

  if (pubRows.length === 0) return [];

  const uris = pubRows.map((p) => p.uri);

  // The newsletter's own subscriber list — confirmed rows in
  // `newsletter_subscribers`, NOT the standard.site follower count in
  // `publication_stats`. A reader can follow the publication without being on
  // the email list, so those numbers are unrelated; a newly connected
  // publication has 0 email subscribers until people sign up.
  const subCountRows = await db
    .select({
      publicationUri: newsletterSubscribers.publicationUri,
      confirmed: sql<number>`(count(*) filter (where ${newsletterSubscribers.status} = 'confirmed'))::int`,
      new7d: sql<number>`(count(*) filter (where ${newsletterSubscribers.status} = 'confirmed' and ${newsletterSubscribers.confirmedAt} >= now() - interval '7 days'))::int`,
    })
    .from(newsletterSubscribers)
    .where(inArray(newsletterSubscribers.publicationUri, uris))
    .groupBy(newsletterSubscribers.publicationUri);
  const subsByPub = new Map(subCountRows.map((r) => [r.publicationUri, r]));
  const docRows = await db
    .select({
      uri: documents.uri,
      publicationUri: documents.publicationUri,
      rkey: documents.rkey,
      title: documents.title,
      path: documents.path,
      description: documents.description,
      publishedAt: documents.publishedAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.deleted, false),
        inArray(documents.publicationUri, uris),
      ),
    )
    .orderBy(desc(documents.publishedAt));

  const docsByPub = new Map<string, Array<DocRow>>();
  for (const d of docRows) {
    if (!d.publicationUri) continue;
    const list = docsByPub.get(d.publicationUri) ?? [];
    if (list.length < 12) list.push(d);
    docsByPub.set(d.publicationUri, list);
  }

  // Real delivery metrics for the posts we'll show (empty until sends recorded).
  const shownUris = [...docsByPub.values()].flat().map((d) => d.uri);
  const metricsByDoc = await loadSendMetrics(shownUris);

  return pubRows.map((p) => {
    const counts = subsByPub.get(p.uri);
    const subs = counts?.confirmed ?? 0;
    const docs = docsByPub.get(p.uri) ?? [];
    // Only mailed posts are sends. A post with no metrics row was never mailed,
    // so it's dropped rather than shown with invented delivery numbers — a
    // connected-but-never-sent publication has an empty `sends`, and the screens
    // render their "nothing sent yet" states off that.
    const sends = docs
      .map((d) => {
        const metrics = metricsByDoc.get(d.uri);
        return metrics ? toSend(d, metrics) : null;
      })
      .filter((s): s is Send => s !== null)
      .toSorted((a, b) => b.sentAtMs - a.sentAtMs);

    const avgRate = (pick: (s: Send) => number) =>
      sends.length > 0
        ? Math.round(
            (sends.reduce((sum, s) => sum + pick(s), 0) / sends.length) * 10,
          ) / 10
        : 0;

    return {
      id: p.rkey,
      uri: p.uri,
      name: p.name,
      icon: (p.name.trim()[0] ?? "•").toUpperCase(),
      iconUrl: publicationIconUrl(p.did, p.iconCid),
      url: displayUrl(p.url),
      desc: p.description ?? "",
      theme: {
        background: p.themeBackground ?? DEFAULT_THEME.background,
        foreground: p.themeForeground ?? DEFAULT_THEME.foreground,
        accent: p.themeAccent ?? DEFAULT_THEME.accent,
        accentForeground:
          p.themeAccentForeground ?? DEFAULT_THEME.accentForeground,
      },
      subs,
      delta: counts?.new7d ?? 0,
      openRate: avgRate((s) => s.openRate),
      clickRate: avgRate((s) => s.clickRate),
      cadence: cadenceFromSends(sends.map((s) => s.sentAtMs)),
      // No historical subscriber timeseries exists in the read model, so there
      // is nothing to chart — an empty series, not a fabricated growth curve.
      growth: [],
      sends,
    } satisfies Publication;
  });
}
