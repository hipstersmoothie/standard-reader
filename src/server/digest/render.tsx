/**
 * Render a {@link DigestData} for one recipient into the `{ subject, html, text }`
 * comail needs. Maps `ArticleCard`/`PublicationCard` onto the ported React Email
 * component's props (link building, icon fallbacks, absolute URLs) and produces
 * both an HTML and a plaintext part (comail requires `text`).
 */

import { render } from "@react-email/render";

import {
  articleReaderUrl,
  collectionPieceReadUrl,
  publicationLinkParams,
} from "#/components/reader/format";
import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";

import type { DigestData } from "./builder";
import WeeklyDigestEmail from "./emails/WeeklyDigestEmail";
import type {
  DigestArticle,
  DigestPublication,
} from "./emails/WeeklyDigestEmail";
import { makeUnsubscribeToken } from "./unsubscribe-token";

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export interface RenderDigestOptions {
  /** Absolute site origin (from `getPublicUrl()`), no trailing slash required. */
  baseUrl: string;
  /** The recipient's `user.id`, used to sign their unsubscribe link. */
  userId: string;
  /** Reference date for the "week of" label; defaults to now. */
  now?: Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEK_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Digest for week of Jul 4, 2026" — subject line; dates the covered week. */
function subjectFor(now: Date): string {
  const start = new Date(now.getTime() - WEEK_MS);
  return `Digest for week of ${WEEK_LABEL_FMT.format(start)}`;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

/** In-app reader when renderable, else the publication site, else the app. */
function articleUrl(card: ArticleCard, baseUrl: string): string {
  return (
    collectionPieceReadUrl(card, baseUrl) ??
    articleReaderUrl(card.uri, baseUrl) ??
    card.canonicalUrl ??
    trimBase(baseUrl)
  );
}

/** On-site `/p/$did/$rkey` when the URI parses, else the external pub URL. */
function publicationUrl(pub: PublicationCard, baseUrl: string): string {
  const params = publicationLinkParams(pub.uri);
  if (params) {
    return `${trimBase(baseUrl)}/p/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
  }
  return pub.url || trimBase(baseUrl);
}

function toDigestArticle(card: ArticleCard, baseUrl: string): DigestArticle {
  return {
    title: card.title,
    description: card.description,
    coverImageUrl: card.coverImageUrl,
    authorDisplayName: card.authorDisplayName,
    authorHandle: card.authorHandle ? `@${card.authorHandle}` : null,
    publicationName: card.publicationName,
    publicationIconUrl:
      card.publicationIconUrl ?? card.publicationOwnerAvatarUrl,
    recommendCount: card.recommendCount,
    url: articleUrl(card, baseUrl),
  };
}

function toDigestPublication(
  pub: PublicationCard,
  baseUrl: string,
): DigestPublication {
  return {
    name: pub.name,
    iconUrl: pub.iconUrl ?? pub.ownerAvatarUrl,
    description: pub.description,
    subscriberCount: pub.subscriberCount,
    url: publicationUrl(pub, baseUrl),
  };
}

export async function renderDigestEmail(
  digest: DigestData,
  options: RenderDigestOptions,
): Promise<RenderedDigest> {
  const base = trimBase(options.baseUrl);
  const now = options.now ?? new Date();

  const articles = digest.articles.map((card) => toDigestArticle(card, base));
  const networkArticles = digest.networkArticles.map((card) =>
    toDigestArticle(card, base),
  );
  const saved = digest.saved.map((card) => toDigestArticle(card, base));
  const recommendations = digest.recommendations.map((pub) =>
    toDigestPublication(pub, base),
  );

  const token = makeUnsubscribeToken(options.userId);
  const props = {
    articles,
    networkArticles,
    saved,
    recommendations,
    unsubscribeUrl: `${base}/api/digest/unsubscribe?token=${encodeURIComponent(token)}`,
    logoUrl: `${base}/icon-192.png`,
  };

  const element = <WeeklyDigestEmail {...props} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  return { subject: subjectFor(now), html, text };
}
