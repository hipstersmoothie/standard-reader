import { standardReader } from "@standard-reader/lexicons";
import { z } from "zod";

import { InvalidInputError } from "../errors.js";
import { errorResult, jsonResult } from "../format.js";
import { asAtUri, asDid } from "../refs.js";
import { AT_URI_NOTE, AUTH_NOTE } from "./context.js";
import type { ToolRegistrar } from "./context.js";

const READ_ONLY = { openWorldHint: true, readOnlyHint: true } as const;

export const registerFeedTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "get_feed",
    {
      title: "Get a feed",
      description:
        "Read any of Standard Reader's article and publication feeds.\n" +
        "- `home` — the signed-in reader's front page (featured lead + latest " +
        "rows).\n" +
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
        `\n${AUTH_NOTE} — for home, latest's unread/subscriptions filters, and ` +
        "both personalised feeds. Everything else reads fine signed out.",
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
        const page = {
          ...(limit ? { limit } : {}),
          ...(cursor ? { cursor } : {}),
        };
        const client = ctx.reader.client;

        switch (feed) {
          case "home": {
            // `home` speaks scope, not filter; "unread" has no home equivalent.
            const scope = args.filter === "all" ? "all" : "subscriptions";
            return jsonResult(
              await client.call(standardReader.getHomeFeed, { scope }),
            );
          }
          case "latest": {
            return jsonResult(
              await client.call(standardReader.getLatestFeed, {
                ...page,
                ...(args.filter ? { filter: args.filter } : {}),
              }),
            );
          }
          case "trending_articles": {
            return jsonResult(
              await client.call(standardReader.getTrendingDocuments, {
                ...(limit ? { limit } : {}),
                scope: "page",
              }),
            );
          }
          case "trending_publications": {
            return jsonResult(
              await client.call(
                standardReader.getTrendingPublications,
                limit ? { limit } : {},
              ),
            );
          }
          case "tag": {
            if (!args.tag) {
              throw new InvalidInputError("feed=tag requires a `tag`.");
            }
            return jsonResult(
              await client.call(standardReader.getTagFeed, {
                ...page,
                tag: args.tag,
                ...(args.view ? { view: args.view } : {}),
                ...(args.sort ? { sort: args.sort } : {}),
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
              await client.call(standardReader.getListFeed, {
                ...page,
                list: asAtUri(args.list, "list"),
              }),
            );
          }
          case "publication_directory": {
            return jsonResult(
              await client.call(standardReader.getPublications, {
                ...page,
                ...(args.topic ? { topic: args.topic } : {}),
                ...(args.query ? { q: args.query } : {}),
                ...(args.sort === "readers" ||
                args.sort === "active" ||
                args.sort === "az"
                  ? { sort: args.sort }
                  : {}),
              }),
            );
          }
          case "recommended_publications": {
            return jsonResult(
              await client.call(
                standardReader.getRecommendedPublications,
                limit ? { limit } : {},
              ),
            );
          }
          case "friends_publications": {
            return jsonResult(
              await client.call(
                standardReader.getFollowedByPeopleYouFollow,
                limit ? { limit } : {},
              ),
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
        "list a reader has authored. With neither, returns the signed-in " +
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
            await ctx.reader.client.call(standardReader.getList, {
              list: asAtUri(list, "list"),
            }),
          );
        }
        const subject = did ?? (await ctx.reader.did());
        if (!subject) {
          throw new InvalidInputError(
            "Pass `list` or `did`, or sign in to read your own lists.",
          );
        }
        return jsonResult(
          await ctx.reader.client.call(standardReader.getUserLists, {
            did: asDid(subject, "did"),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
