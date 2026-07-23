/**
 * Minimal read-model of the Standard Reader database — only the columns the
 * newsletter analytics reads. Column names/types mirror the reader's schema so
 * this points at the SAME physical tables (same DATABASE_URL). This is a
 * deliberately small, read-only subset; promoting the reader's `src/db` into a
 * shared `@standard-reader/db` package is the clean long-term move.
 */

import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const publications = pgTable("publications", {
  uri: text("uri").primaryKey(),
  did: text("did").notNull(),
  rkey: text("rkey").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  themeAccent: text("theme_accent"),
  themeBackground: text("theme_background"),
  themeForeground: text("theme_foreground"),
  themeAccentForeground: text("theme_accent_foreground"),
  deleted: boolean("deleted").notNull().default(false),
});

export const publicationStats = pgTable("publication_stats", {
  publicationUri: text("publication_uri").primaryKey(),
  subscriberCount: integer("subscriber_count").notNull().default(0),
  documentCount: integer("document_count").notNull().default(0),
  subscribers7d: integer("subscribers_7d").notNull().default(0),
});

export const documents = pgTable("documents", {
  uri: text("uri").primaryKey(),
  did: text("did").notNull(),
  rkey: text("rkey").notNull(),
  title: text("title").notNull(),
  publicationUri: text("publication_uri"),
  path: text("path"),
  canonicalUrl: text("canonical_url"),
  description: text("description"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  deleted: boolean("deleted").notNull().default(false),
});
