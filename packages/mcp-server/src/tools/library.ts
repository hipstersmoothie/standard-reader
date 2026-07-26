import { standardReader } from "@standard-reader/lexicons";
import { z } from "zod";

import { InvalidInputError } from "../errors.js";
import { errorResult, jsonResult } from "../format.js";
import { asAtUri, asDid, asOptionalDid } from "../refs.js";
import { AT_URI_NOTE, AUTH_NOTE } from "./context.js";
import type { ToolRegistrar } from "./context.js";

const READ_ONLY = { openWorldHint: true, readOnlyHint: true } as const;

/** Cap on subjects per `get_status` call — each one is its own XRPC round trip. */
const MAX_STATUS_SUBJECTS = 25;

export const registerLibraryTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "get_library",
    {
      title: "Get a reader's library",
      description:
        "Read a reader's own collections: `bookmarks` (the save-for-later " +
        "queue), `history` (what they have read), `likes` (articles they " +
        "recommended), `subscriptions` (publications they follow). Defaults " +
        "to the signed-in reader; pass `did` to read another reader's public " +
        `indexed state instead. ${AUTH_NOTE}`,
      inputSchema: {
        section: z
          .enum(["bookmarks", "history", "likes", "subscriptions"])
          .describe("Which collection to read."),
        did: z
          .string()
          .optional()
          .describe(
            "Read this reader's public state instead of the signed-in one.",
          ),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ section, did, limit, cursor }) => {
      try {
        const subject = asOptionalDid(did, "did");
        const page = {
          ...(subject ? { did: subject } : {}),
          ...(limit ? { limit } : {}),
          ...(cursor ? { cursor } : {}),
        };
        const client = ctx.reader.client;

        switch (section) {
          case "bookmarks": {
            return jsonResult(await client.call(standardReader.getSaved, page));
          }
          case "history": {
            return jsonResult(
              await client.call(standardReader.getReadingHistory, page),
            );
          }
          case "likes": {
            return jsonResult(await client.call(standardReader.getLikes, page));
          }
          case "subscriptions": {
            // Unlike the others, this endpoint has no implicit "me" — it always
            // needs an explicit subject DID.
            const owner = subject ?? (await ctx.reader.did());
            if (!owner) {
              throw new InvalidInputError(
                "Reading subscriptions needs a `did`, or a signed-in reader.",
              );
            }
            return jsonResult(
              await client.call(standardReader.getUserSubscriptions, {
                ...page,
                did: asDid(owner, "did"),
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
    "get_status",
    {
      title: "Get a reader's state for subjects",
      description:
        "Check, in one call, whether a reader has read / bookmarked / liked " +
        "given articles, subscribes to given publications, or follows given " +
        "users. Use this before writing so you don't re-bookmark something " +
        `already saved. ${AT_URI_NOTE} ${AUTH_NOTE} (or pass ` +
        "`did` to read another reader's public state).",
      inputSchema: {
        articles: z
          .array(z.string())
          .default([])
          .describe("Article AT-URIs to check read/bookmark/like state for."),
        publications: z
          .array(z.string())
          .default([])
          .describe("Publication AT-URIs to check subscription state for."),
        users: z
          .array(z.string())
          .default([])
          .describe("User DIDs to check follow state for."),
        did: z
          .string()
          .optional()
          .describe("Check this reader instead of the signed-in one."),
      },
      annotations: READ_ONLY,
    },
    async ({ articles, publications, users, did }) => {
      try {
        const total = articles.length + publications.length + users.length;
        if (total === 0) {
          throw new InvalidInputError(
            "Pass at least one of `articles`, `publications` or `users`.",
          );
        }
        if (total > MAX_STATUS_SUBJECTS) {
          throw new InvalidInputError(
            `Too many subjects (${total}); ${MAX_STATUS_SUBJECTS} at most per ` +
              "call.",
          );
        }

        const reader = asOptionalDid(did, "did");
        const who = reader ? { did: reader } : {};
        const client = ctx.reader.client;

        const [articleStates, publicationStates, userStates] =
          await Promise.all([
            Promise.all(
              articles.map(async (input) => {
                const uri = asAtUri(input, "articles");
                const [read, bookmarked, liked] = await Promise.all([
                  client.call(standardReader.getReadStatus, {
                    ...who,
                    document: uri,
                  }),
                  client.call(standardReader.getBookmarkStatus, {
                    ...who,
                    document: uri,
                  }),
                  client.call(standardReader.getRecommendStatus, {
                    ...who,
                    document: uri,
                  }),
                ]);
                return {
                  uri,
                  read: read.active,
                  bookmarked: bookmarked.active,
                  liked: liked.active,
                };
              }),
            ),
            Promise.all(
              publications.map(async (input) => {
                const status = await client.call(
                  standardReader.getFollowStatus,
                  { ...who, publication: asAtUri(input, "publications") },
                );
                return { uri: input, subscribed: status.active };
              }),
            ),
            Promise.all(
              users.map(async (input) => {
                const status = await client.call(
                  standardReader.getUserFollowStatus,
                  { ...who, subject: asDid(input, "users") },
                );
                return { did: input, following: status.active };
              }),
            ),
          ]);

        return jsonResult({
          articles: articleStates,
          publications: publicationStates,
          users: userStates,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
