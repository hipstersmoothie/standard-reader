import { relations } from "drizzle-orm";

import { documentContributors, documents } from "./documents.ts";
import { recommends, subscriptions } from "./graph.ts";
import { bookmarks, reads } from "./personal.ts";
import { profiles } from "./profiles.ts";
import { publications } from "./publications.ts";
import { publicationCosubscriptions, publicationStats } from "./stats.ts";

export const profilesRelations = relations(profiles, ({ many }) => ({
  publications: many(publications),
  contributions: many(documentContributors),
}));

export const publicationsRelations = relations(
  publications,
  ({ one, many }) => ({
    owner: one(profiles, {
      fields: [publications.did],
      references: [profiles.did],
    }),
    stats: one(publicationStats, {
      fields: [publications.uri],
      references: [publicationStats.publicationUri],
    }),
    documents: many(documents),
    subscriptions: many(subscriptions),
  }),
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  publication: one(publications, {
    fields: [documents.publicationUri],
    references: [publications.uri],
  }),
  author: one(profiles, {
    fields: [documents.did],
    references: [profiles.did],
  }),
  contributors: many(documentContributors),
  recommends: many(recommends),
  bookmarks: many(bookmarks),
  reads: many(reads),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  document: one(documents, {
    fields: [bookmarks.documentUri],
    references: [documents.uri],
  }),
  owner: one(profiles, {
    fields: [bookmarks.ownerDid],
    references: [profiles.did],
  }),
}));

export const readsRelations = relations(reads, ({ one }) => ({
  document: one(documents, {
    fields: [reads.documentUri],
    references: [documents.uri],
  }),
  owner: one(profiles, {
    fields: [reads.ownerDid],
    references: [profiles.did],
  }),
}));

export const documentContributorsRelations = relations(
  documentContributors,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentContributors.documentUri],
      references: [documents.uri],
    }),
    profile: one(profiles, {
      fields: [documentContributors.did],
      references: [profiles.did],
    }),
  }),
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  publication: one(publications, {
    fields: [subscriptions.publicationUri],
    references: [publications.uri],
  }),
  subscriber: one(profiles, {
    fields: [subscriptions.subscriberDid],
    references: [profiles.did],
  }),
}));

export const recommendsRelations = relations(recommends, ({ one }) => ({
  document: one(documents, {
    fields: [recommends.documentUri],
    references: [documents.uri],
  }),
  recommender: one(profiles, {
    fields: [recommends.recommenderDid],
    references: [profiles.did],
  }),
}));

export const publicationStatsRelations = relations(
  publicationStats,
  ({ one }) => ({
    publication: one(publications, {
      fields: [publicationStats.publicationUri],
      references: [publications.uri],
    }),
  }),
);

export const publicationCosubscriptionsRelations = relations(
  publicationCosubscriptions,
  ({ one }) => ({
    publication: one(publications, {
      fields: [publicationCosubscriptions.publicationUri],
      references: [publications.uri],
    }),
    related: one(publications, {
      fields: [publicationCosubscriptions.relatedPublicationUri],
      references: [publications.uri],
    }),
  }),
);
