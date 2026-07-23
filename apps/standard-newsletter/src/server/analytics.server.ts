/**
 * Server-only: read publications, their subscriber counts, and their published
 * posts from the shared Standard Reader database and shape them for the
 * analytics UI.
 *
 * IMPORTANT — data reality: the reader DB has real publications, subscriber
 * counts (`publication_stats`), and posts (`documents`), but it has NO email
 * delivery data (opens/clicks/unsubscribes/bounces, per-send recipients, or a
 * subscriber-growth time series). Those live only once the Resend send pipeline
 * records send events. Until that schema exists, the delivery metrics below are
 * DETERMINISTIC PLACEHOLDERS derived from stable ids — clearly synthetic, so the
 * screens stay populated without inventing a data source. Everything that IS
 * real (names, URLs, descriptions, themes, subscriber counts, the post list and
 * its titles/dates) comes straight from the DB.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { documents, publicationStats, publications } from "@standard-reader/db/schema";

import type { Publication, Send } from "../data/publications";
import { getDb } from "../db/index.server";
import { type DocSendMetrics, loadSendMetrics } from "./send-events.server";

const DEFAULT_THEME = {
  background: "#fcf9f5",
  foreground: "#3e332e",
  accent: "#ad7f58",
  accentForeground: "#ffffff",
};

/** Stable 32-bit hash for deterministic synthetic metrics. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic value in [lo, hi] from a seed (placeholder metric). */
function synth(seed: string, lo: number, hi: number, decimals = 0): number {
  const t = (hash(seed) % 1000) / 1000;
  const v = lo + t * (hi - lo);
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
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

/** 12-point subscriber-growth series ramping up to the current count. */
function synthGrowth(id: string, subs: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    if (i === 11) return subs;
    const base = 0.72 + 0.28 * (i / 11);
    const jitter = 1 + (synth(`${id}-g${i}`, -20, 20) / 1000);
    return Math.round(subs * base * jitter);
  });
}

function toSend(
  pubId: string,
  subs: number,
  doc: DocRow,
  metrics?: DocSendMetrics,
): Send {
  const base = {
    title: doc.title,
    path: doc.path ?? doc.rkey,
    subject: doc.description ?? doc.title,
    when: formatWhen(doc.publishedAt),
  };

  // Real delivery metrics when this post has actually been sent.
  if (metrics) {
    const denom = metrics.delivered || metrics.recipients || 1;
    const round1 = (n: number) => Math.round(n * 1000) / 10;
    return {
      ...base,
      recipients: metrics.recipients || subs,
      openRate: round1(metrics.opens / denom),
      clickRate: round1(metrics.clicks / denom),
      unsubs: metrics.unsubs,
      bounces: metrics.bounces,
      delivered: metrics.delivered,
      opensByHour: metrics.opensByHour,
      topLinks: metrics.topLinks,
    };
  }

  // Placeholder metrics for posts not yet mailed / sample data.
  const seed = `${pubId}-${doc.rkey}`;
  return {
    ...base,
    recipients: Math.max(0, subs - synth(`${seed}-r`, 0, 60)),
    openRate: synth(`${seed}-o`, 45, 66, 1),
    clickRate: synth(`${seed}-c`, 5, 14, 1),
    unsubs: synth(`${seed}-u`, 4, 22),
    bounces: synth(`${seed}-b`, 5, 22),
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
 * Load every publication with real identity + subscriber counts + posts.
 * Returns `null` when no DB is configured so the caller can use sample data.
 */
export async function loadPublicationsFromDb(): Promise<Publication[] | null> {
  const db = getDb();
  if (!db) return null;

  const pubRows = await db
    .select({
      uri: publications.uri,
      rkey: publications.rkey,
      name: publications.name,
      url: publications.url,
      description: publications.description,
      themeAccent: publications.themeAccent,
      themeBackground: publications.themeBackground,
      themeForeground: publications.themeForeground,
      themeAccentForeground: publications.themeAccentForeground,
      subscriberCount: publicationStats.subscriberCount,
      documentCount: publicationStats.documentCount,
      subscribers7d: publicationStats.subscribers7d,
    })
    .from(publications)
    .leftJoin(
      publicationStats,
      eq(publicationStats.publicationUri, publications.uri),
    )
    .where(eq(publications.deleted, false))
    .orderBy(desc(publicationStats.subscriberCount))
    .limit(50);

  if (pubRows.length === 0) return [];

  const uris = pubRows.map((p) => p.uri);
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
      and(eq(documents.deleted, false), inArray(documents.publicationUri, uris)),
    )
    .orderBy(desc(documents.publishedAt));

  const docsByPub = new Map<string, DocRow[]>();
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
    const subs = p.subscriberCount ?? 0;
    const docs = docsByPub.get(p.uri) ?? [];
    const sends = docs.map((d) => toSend(p.rkey, subs, d, metricsByDoc.get(d.uri)));
    const cadences = ["Weekly", "Biweekly", "Monthly"];
    return {
      id: p.rkey,
      name: p.name,
      icon: (p.name.trim()[0] ?? "•").toUpperCase(),
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
      delta: p.subscribers7d ?? 0,
      openRate: sends.length
        ? Math.round(
            (sends.reduce((s, x) => s + x.openRate, 0) / sends.length) * 10,
          ) / 10
        : synth(`${p.rkey}-o`, 45, 66, 1),
      clickRate: sends.length
        ? Math.round(
            (sends.reduce((s, x) => s + x.clickRate, 0) / sends.length) * 10,
          ) / 10
        : synth(`${p.rkey}-c`, 5, 14, 1),
      cadence: cadences[hash(p.rkey) % cadences.length],
      growth: synthGrowth(p.rkey, subs),
      sends,
    } satisfies Publication;
  });
}
