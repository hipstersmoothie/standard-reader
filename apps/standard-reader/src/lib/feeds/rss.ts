/**
 * Framework-free RSS 2.0 serializer for the public feed routes (`src/routes/feed.*.tsx`).
 * Pure string building — no XML library dependency, no React.
 */

export interface FeedChannel {
  title: string;
  /** Public page this feed mirrors (e.g. the publication profile or list page). */
  link: string;
  description: string;
  /** Absolute URL of the feed itself, for `atom:link rel="self"`. */
  selfUrl: string;
  language?: string;
  /** Channel artwork (publication icon, or the site OG image as a fallback). */
  imageUrl?: string | null;
}

export interface FeedItem {
  uri: string;
  title: string;
  /** Public link for the item — canonical publication URL or in-app reader URL. */
  link: string;
  description: string | null;
  /** Byline name for `dc:creator`. */
  creator: string | null;
  publishedAt: string;
  tags: Array<string> | null;
  /** Full HTML body for `content:encoded`, when available (see `documentContentHtml`). */
  contentHtml: string | null;
  coverImageUrl: string | null;
}

const GENERATOR = "Standard Reader (https://standard-reader.com)";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Wrap in CDATA, escaping any literal `]]>` so it can't terminate the section early. */
function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function rfc822(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time)
    ? new Date(0).toUTCString()
    : new Date(time).toUTCString();
}

function renderItem(item: FeedItem): string {
  const parts: Array<string> = [];
  parts.push("<item>");
  parts.push(`<title>${cdata(item.title)}</title>`);
  parts.push(`<link>${xmlEscape(item.link)}</link>`);
  parts.push(`<guid isPermaLink="false">${xmlEscape(item.uri)}</guid>`);
  parts.push(`<pubDate>${rfc822(item.publishedAt)}</pubDate>`);
  if (item.creator) {
    parts.push(`<dc:creator>${cdata(item.creator)}</dc:creator>`);
  }
  if (item.description) {
    parts.push(`<description>${cdata(item.description)}</description>`);
  }
  if (item.contentHtml) {
    parts.push(`<content:encoded>${cdata(item.contentHtml)}</content:encoded>`);
  }
  for (const tag of item.tags ?? []) {
    parts.push(`<category>${cdata(tag)}</category>`);
  }
  if (item.coverImageUrl) {
    parts.push(
      `<media:content url="${xmlEscape(item.coverImageUrl)}" medium="image" />`,
    );
  }
  parts.push("</item>");
  return parts.join("");
}

/** Serialize a channel + its items into an RSS 2.0 document. */
export function renderRssFeed(
  channel: FeedChannel,
  items: Array<FeedItem>,
): string {
  const parts: Array<string> = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:atom="http://www.w3.org/2005/Atom" ' +
      'xmlns:media="http://search.yahoo.com/mrss/">',
  );
  parts.push("<channel>");
  parts.push(`<title>${cdata(channel.title)}</title>`);
  parts.push(`<link>${xmlEscape(channel.link)}</link>`);
  parts.push(`<description>${cdata(channel.description)}</description>`);
  parts.push(`<language>${xmlEscape(channel.language ?? "en")}</language>`);
  parts.push(`<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`);
  parts.push(`<generator>${xmlEscape(GENERATOR)}</generator>`);
  parts.push(
    `<atom:link href="${xmlEscape(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
  );
  if (channel.imageUrl) {
    parts.push(
      `<image><url>${xmlEscape(channel.imageUrl)}</url><title>${cdata(
        channel.title,
      )}</title><link>${xmlEscape(channel.link)}</link></image>`,
    );
  }
  for (const item of items) {
    parts.push(renderItem(item));
  }
  parts.push("</channel>");
  parts.push("</rss>");
  return parts.join("");
}
