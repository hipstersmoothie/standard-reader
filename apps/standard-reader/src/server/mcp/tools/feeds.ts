import { z } from "zod";

import { InvalidInputError } from "../errors";
import { errorResult, jsonResult } from "../format";
import { QUERY } from "../methods";
import { asAtUri, asDid } from "../refs";
import { AT_URI_NOTE, AUTH_NOTE, READ_ONLY } from "./context";
import type { ToolRegistrar } from "./context";

export const registerFeedTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "get_feed",
    {
      title: "Get a feed",
      description:
        "Read any of Standard Reader's article and publication feeds.\n" +
        "- `home` — the reader's front page (featured lead + latest rows).\n" +
        "- `latest` — chronological articles, filtered to all / their " +
        "subscriptions / unread.\n" +
        "- `trending_articles`, `trending_publications` — what is popular " +
        "network-wide right now.\n" +
        "- `tag` — everything carrying a topic tag.\n" +
        "- `list` — articles across every publication in a reader's list.\n" +
        "- `publication_directory` — browse/filter the whole publication " +
        "directory.\n" +
        "- `recommended_publications`, `friends_publications` — personalised " +
        "suggestions.\n" +
        `\n${AUTH_NOTE} — for home, latest's unread/subscriptions filters, ` +
        "and both personalised feeds. Everything else reads fine " +
        "unauthorized.",
      inputSchema: {
        feed: z
          .enum([
            "home",
            "latest",
            "trending_articles",
            "trending_publications",
            "tag",
            "list",
            "publication_directory",
            "recommended_publications",
            "friends_publications",
          ])
          .describe("Which feed to read."),
        tag: z.string().optional().describe("Required for feed=tag."),
        list: z
          .string()
          .optional()
          .describe(`Required for feed=list: a list AT-URI. ${AT_URI_NOTE}`),
        filter: z
          .enum(["all", "subscriptions", "unread"])
          .optional()
          .describe(
            "feed=latest and feed=home only. Defaults to subscriptions.",
          ),
        view: z
          .enum(["articles", "publications"])
          .optional()
          .describe("feed=tag only. Defaults to articles."),
        sort: z
          .string()
          .optional()
          .describe(
            "feed=publication_directory: readers | active | az. feed=tag: the " +
              "tag view's own sort keys.",
          ),
        topic: z
          .string()
          .optional()
          .describe("feed=publication_directory only: filter by topic."),
        query: z
          .string()
          .optional()
          .describe("feed=publication_directory only: filter by name."),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        const { feed, limit, cursor } = args;
        const page = { limit, cursor };
        const { session } = ctx;

        switch (feed) {
          case "home": {
            // `home` speaks scope, not filter; "unread" has no home equivalent.
            return jsonResult(
              await session.authedQuery(QUERY.getHomeFeed, {
                scope: args.filter === "all" ? "all" : "subscriptions",
              }),
            );
          }
          case "latest": {
            return jsonResult(
              await session.query(QUERY.getLatestFeed, {
                ...page,
                filter: args.filter,
              }),
            );
          }
          case "trending_articles": {
            return jsonResult(
              await session.query(QUERY.getTrendingDocuments, {
                limit,
                scope: "page",
              }),
            );
          }
          case "trending_publications": {
            return jsonResult(
              await session.query(QUERY.getTrendingPublications, { limit }),
            );
          }
          case "tag": {
            if (!args.tag) {
              throw new InvalidInputError("feed=tag requires a `tag`.");
            }
            return jsonResult(
              await session.query(QUERY.getTagFeed, {
                ...page,
                tag: args.tag,
                view: args.view,
                sort: args.sort,
              }),
            );
          }
          case "list": {
            if (!args.list) {
              throw new InvalidInputError(
                "feed=list requires a `list` AT-URI.",
              );
            }
            return jsonResult(
              await session.query(QUERY.getListFeed, {
                ...page,
                list: asAtUri(args.list, "list"),
              }),
            );
          }
          case "publication_directory": {
            return jsonResult(
              await session.query(QUERY.getPublications, {
                ...page,
                topic: args.topic,
                q: args.query,
                sort: args.sort,
              }),
            );
          }
          case "recommended_publications": {
            return jsonResult(
              await session.authedQuery(QUERY.getRecommendedPublications, {
                limit,
              }),
            );
          }
          case "friends_publications": {
            return jsonResult(
              await session.authedQuery(QUERY.getFollowedByPeopleYouFollow, {
                limit,
              }),
            );
          }
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_lists",
    {
      title: "Get publication lists",
      description:
        "Read publication lists — a reader's curated bundles of publications. " +
        "Pass `list` for one list's metadata and members, or `did` for every " +
        "list a reader has authored. With neither, returns the authorizing " +
        `reader's own lists. ${AUTH_NOTE} (for the no-argument form).`,
      inputSchema: {
        list: z
          .string()
          .optional()
          .describe(`A single list's AT-URI. ${AT_URI_NOTE}`),
        did: z
          .string()
          .optional()
          .describe("Read every list authored by this DID."),
      },
      annotations: READ_ONLY,
    },
    async ({ list, did }) => {
      try {
        if (list) {
          return jsonResult(
            await ctx.session.query(QUERY.getList, {
              list: asAtUri(list, "list"),
            }),
          );
        }
        const subject = did ?? ctx.session.did;
        if (!subject) {
          throw new InvalidInputError(
            "Pass `list` or `did`, or authorize this connection to read your " +
              "own lists.",
          );
        }
        return jsonResult(
          await ctx.session.query(QUERY.getUserLists, {
            did: asDid(subject, "did"),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
