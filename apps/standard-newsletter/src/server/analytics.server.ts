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
 * come from the send pipeline via `loadSendMetrics`, and `growth` is the list's
 * real month-by-month size from subscriber signup/unsubscribe timestamps (see
 * `loadSubscriberGrowth`). Nothing is fabricated — a post that hasn't been
 * mailed contributes no `Send`, so a publication with no sends reports zeros
 * and empty states rather than invented numbers.
 */

import {
  documents,
  newsletterPublications,
  newsletterSubscribers,
  publications,
} from "@standard-reader/db/schema";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import type {
  GrowthPoint,
  Publication,
  PublicationTheme,
  Send,
} from "../data/publications";
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

/** Months in the subscriber-growth series. */
const GROWTH_MONTHS = 12;

/** The series' buckets, oldest first: a sortable `YYYY-MM` key and its label. */
function growthWindow(now: Date): Array<{ key: string; label: string }> {
  const months: Array<{ key: string; label: string }> = [];
  for (let i = GROWTH_MONTHS - 1; i >= 0; i--) {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const month = String(start.getUTCMonth() + 1).padStart(2, "0");
    months.push({
      key: `${start.getUTCFullYear()}-${month}`,
      label: start.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
    });
  }
  return months;
}

/**
 * The real size of each publication's list at the end of each of the last 12
 * months, from the timestamps on `newsletter_subscribers`: a subscriber who
 * ever confirmed is +1 in the month they joined and −1 in the month they
 * unsubscribed, so a running total is the list as it actually stood.
 *
 * The total opens with everything that happened *before* the window, so a list
 * older than a year carries its history in, and the final point equals the
 * confirmed count on the KPI cards. Publications with no subscribers get a flat
 * zero series, which the screens read as "no chart to draw".
 */
async function loadSubscriberGrowth(
  db: NonNullable<ReturnType<typeof getDb>>,
  uris: Array<string>,
  now: Date,
): Promise<Map<string, Array<GrowthPoint>>> {
  const ofThisList = inArray(newsletterSubscribers.publicationUri, uris);
  // `confirmed_at` has only been written since confirmation was introduced, so
  // a legacy confirmed row falls back to when it was created. A row that went
  // pending → unsubscribed never counted, and must not subtract.
  const everConfirmed = sql`(${newsletterSubscribers.confirmedAt} is not null or ${newsletterSubscribers.status} = 'confirmed')`;
  const joinedMonth = sql<string>`to_char(date_trunc('month', coalesce(${newsletterSubscribers.confirmedAt}, ${newsletterSubscribers.createdAt}) at time zone 'UTC'), 'YYYY-MM')`;
  const leftMonth = sql<string>`to_char(date_trunc('month', ${newsletterSubscribers.unsubscribedAt} at time zone 'UTC'), 'YYYY-MM')`;

  const joined = db
    .select({
      uri: newsletterSubscribers.publicationUri,
      month: joinedMonth,
      delta: sql<number>`count(*)::int`,
    })
    .from(newsletterSubscribers)
    .where(and(ofThisList, everConfirmed))
    .groupBy(newsletterSubscribers.publicationUri, joinedMonth);

  const left = db
    .select({
      uri: newsletterSubscribers.publicationUri,
      month: leftMonth,
      delta: sql<number>`(0 - count(*))::int`,
    })
    .from(newsletterSubscribers)
    .where(
      and(
        ofThisList,
        everConfirmed,
        isNotNull(newsletterSubscribers.unsubscribedAt),
      ),
    )
    .groupBy(newsletterSubscribers.publicationUri, leftMonth);

  const rows = await unionAll(joined, left);

  const deltasByPub = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const byMonth = deltasByPub.get(row.uri) ?? new Map<string, number>();
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + Number(row.delta));
    deltasByPub.set(row.uri, byMonth);
  }

  const months = growthWindow(now);
  const opensAt = months[0].key;
  const out = new Map<string, Array<GrowthPoint>>();
  for (const uri of uris) {
    const byMonth = deltasByPub.get(uri);
    let running = 0;
    if (byMonth) {
      for (const [month, delta] of byMonth) {
        if (month < opensAt) running += delta;
      }
    }
    out.set(
      uri,
      months.map(({ key, label }) => {
        running += byMonth?.get(key) ?? 0;
        return { month: label, subscribers: running };
      }),
    );
  }
  return out;
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
      fromName: newsletterPublications.fromName,
      fromAddress: newsletterPublications.fromAddress,
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
  const [subCountRows, growthByPub] = await Promise.all([
    db
      .select({
        publicationUri: newsletterSubscribers.publicationUri,
        confirmed: sql<number>`(count(*) filter (where ${newsletterSubscribers.status} = 'confirmed'))::int`,
        new7d: sql<number>`(count(*) filter (where ${newsletterSubscribers.status} = 'confirmed' and ${newsletterSubscribers.confirmedAt} >= now() - interval '7 days'))::int`,
      })
      .from(newsletterSubscribers)
      .where(inArray(newsletterSubscribers.publicationUri, uris))
      .groupBy(newsletterSubscribers.publicationUri),
    // Concurrent with the counts: the growth series reads the same table, so
    // the page pays one round trip for both rather than two in sequence.
    loadSubscriberGrowth(db, uris, new Date()),
  ]);
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
      growth: growthByPub.get(p.uri) ?? [],
      sends,
      fromName: p.fromName,
      fromAddress: p.fromAddress,
    } satisfies Publication;
  });
}
