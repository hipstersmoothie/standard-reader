import {
  articleReaderUrl,
  collectionPieceReadUrl,
} from "#/components/reader/format";
/**
 * Weekly "hottest articles" Bluesky thread runner. Selects the top network
 * articles over the past week, composes a reply-chained thread of rich link
 * cards back to Standard Reader, and posts it as the reader bot — then exits.
 *
 * Invoked by the short-lived `thread-cron` job entrypoint
 * (`scripts/post-weekly-thread.ts`), deliberately in its own scheduled process
 * (not the `web` app or the long-lived `ingest` worker), mirroring `digest-cron`.
 *
 * Set `THREAD_DRY_RUN=1` to compose + log the thread without writing any records.
 */
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import { getPublicUrl } from "#/lib/public-url";
import { weekInReviewArticles } from "#/server/reader/queries";

import { db } from "../../db/index.ts";
import * as schema from "../../db/schema.ts";
import { loginAsReaderBot } from "./client.ts";
import {
  BSKY_POST_MAX_GRAPHEMES,
  capGraphemes,
  graphemeCount,
  HOT_ARTICLE_LIMIT,
  HOT_WINDOW_DAYS,
  isDryRun,
} from "./config.ts";
import {
  fetchThumbBlob,
  linkFacets,
  mentionFacet,
  postThread,
} from "./thread.ts";
import type { Facet, PostSpec } from "./thread.ts";

export interface WeeklyThreadSummary {
  /** Hottest articles selected for the thread. */
  articles: number;
  /** Posts actually written to the PDS (0 on a dry run / empty week). */
  posted: number;
  /** AT-URI of the thread root, when posted. */
  rootUri: string | null;
  dryRun: boolean;
}

const CTA_APP_LABEL = "standard-reader.app";

/**
 * Byline text + (when the author's handle resolves) the DID to @mention. The
 * author's handle and `did` both come from the document author, so the mention
 * facet always points at the right account.
 */
function byline(
  card: ArticleCard,
): { text: string; mentionDid?: string } | null {
  if (card.authorHandle && card.did) {
    return { text: `@${card.authorHandle}`, mentionDid: card.did };
  }
  if (card.publicationName) return { text: card.publicationName };
  if (card.authorDisplayName) return { text: card.authorDisplayName };
  return null;
}

/** In-app reader when renderable, else the publication site, else the app. */
function articleUrl(card: ArticleCard, baseUrl: string): string {
  return (
    collectionPieceReadUrl(card, baseUrl) ??
    articleReaderUrl(card.uri, baseUrl) ??
    card.canonicalUrl ??
    baseUrl
  );
}

/** Compose one numbered article post (the first also carries the intro header). */
function articleSpec(
  card: ArticleCard,
  index: number,
  total: number,
  baseUrl: string,
  thumb?: Record<string, unknown> | null,
): PostSpec {
  const n = index + 1;
  const rawTitle = card.title.trim();
  const by = byline(card);

  // Reserve budget for the numbering/intro prefix and the byline suffix so the
  // author @mention at the end is never truncated away by the 300-char cap.
  const prefix =
    index === 0
      ? `🔥 The ${total} hottest reads on Standard Reader this week\n\n${n}. `
      : `${n}. `;
  const suffix = by ? ` — ${by.text}` : "";
  const titleBudget =
    BSKY_POST_MAX_GRAPHEMES - graphemeCount(prefix) - graphemeCount(suffix);
  const title = capGraphemes(rawTitle, Math.max(12, titleBudget));
  const text = `${prefix}${title}${suffix}`;

  const facets: Array<Facet> = [];
  if (by?.mentionDid) {
    const facet = mentionFacet(text, by.text, by.mentionDid);
    if (facet) facets.push(facet);
  }

  return {
    text,
    ...(facets.length > 0 ? { facets } : {}),
    external: {
      uri: articleUrl(card, baseUrl),
      title: capGraphemes(rawTitle, 300),
      description: card.description ?? "",
      ...(thumb ? { thumb } : {}),
    },
  };
}

/** Final call-to-action post with a tappable link to the app. */
function ctaSpec(baseUrl: string): PostSpec {
  const text = `Want a calmer home for reading on ATProto? Standard Reader lets you follow independent writers and publications and read them all in one clean feed.\n\nTry it → ${CTA_APP_LABEL}`;
  return { text, facets: linkFacets(text, CTA_APP_LABEL, baseUrl) };
}

export async function runWeeklyThread(): Promise<WeeklyThreadSummary> {
  const baseUrl = getPublicUrl();
  const dryRun = isDryRun();

  const cards = await weekInReviewArticles(db, schema, {
    sinceDays: HOT_WINDOW_DAYS,
    limit: HOT_ARTICLE_LIMIT,
  });

  if (cards.length === 0) {
    console.info("[thread] no eligible articles this week — nothing to post");
    return { articles: 0, posted: 0, rootUri: null, dryRun };
  }

  if (dryRun) {
    const specs = cards.map((card, i) =>
      articleSpec(card, i, cards.length, baseUrl),
    );
    specs.push(ctaSpec(baseUrl));
    console.info(`[thread] DRY RUN — ${specs.length} posts composed:`);
    for (const [i, spec] of specs.entries()) {
      console.info(`\n--- post ${i + 1} ---\n${spec.text}`);
      if (spec.external) {
        console.info(`  [card] ${spec.external.title} → ${spec.external.uri}`);
      }
      for (const facet of spec.facets ?? []) {
        const feature = facet.features[0];
        const detail =
          feature.$type === "app.bsky.richtext.facet#mention"
            ? `mention ${feature.did}`
            : `link ${feature.uri}`;
        console.info(`  [facet] ${detail}`);
      }
    }
    for (const [i, card] of cards.entries()) {
      const ageDays = (
        (Date.now() - new Date(card.publishedAt).getTime()) /
        86_400_000
      ).toFixed(1);
      console.info(
        `  post ${i + 1} published ${card.publishedAt} (${ageDays}d ago) · cover image: ${card.coverImageUrl ?? "none"}`,
      );
    }
    return { articles: cards.length, posted: 0, rootUri: null, dryRun: true };
  }

  const { client, repo, handle } = await loginAsReaderBot();
  console.info(`[thread] posting as @${handle} (${repo})`);

  const specs: Array<PostSpec> = [];
  for (let i = 0; i < cards.length; i++) {
    const thumb = await fetchThumbBlob(client, cards[i].coverImageUrl);
    specs.push(articleSpec(cards[i], i, cards.length, baseUrl, thumb));
  }
  specs.push(ctaSpec(baseUrl));

  const refs = await postThread(client, repo, specs);
  const rootUri = refs[0]?.uri ?? null;
  console.info(`[thread] posted ${refs.length} posts; root=${rootUri}`);
  return {
    articles: cards.length,
    posted: refs.length,
    rootUri,
    dryRun: false,
  };
}
