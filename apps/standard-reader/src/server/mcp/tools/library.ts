import { z } from "zod";

import { InvalidInputError } from "../errors";
import { errorResult, jsonResult } from "../format";
import { QUERY } from "../methods";
import { asAtUri, asDid, asOptionalDid } from "../refs";
import { activeOf } from "../xrpc";
import { AT_URI_NOTE, AUTH_NOTE, READ_ONLY } from "./context";
import type { ToolRegistrar } from "./context";

/** Cap on subjects per `get_status` call — each one is its own read. */
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
        "to the authorizing reader; pass `did` to read another reader's " +
        `public indexed state instead. ${AUTH_NOTE}`,
      inputSchema: {
        section: z
          .enum(["bookmarks", "history", "likes", "subscriptions"])
          .describe("Which collection to read."),
        did: z
          .string()
          .optional()
          .describe(
            "Read this reader's public state instead of the authorizing one.",
          ),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ section, did, limit, cursor }) => {
      try {
        const subject = asOptionalDid(did, "did");
        const page = { did: subject, limit, cursor };
        const { session } = ctx;

        switch (section) {
          case "bookmarks": {
            return jsonResult(await session.authedQuery(QUERY.getSaved, page));
          }
          case "history": {
            return jsonResult(
              await session.authedQuery(QUERY.getReadingHistory, page),
            );
          }
          case "likes": {
            return jsonResult(await session.authedQuery(QUERY.getLikes, page));
          }
          case "subscriptions": {
            // Unlike the others, this endpoint has no implicit "me" — it always
            // needs an explicit subject DID.
            const owner = subject ?? session.did;
            if (!owner) {
              throw new InvalidInputError(
                "Reading subscriptions needs a `did`, or an authorized reader.",
              );
            }
            return jsonResult(
              await session.query(QUERY.getUserSubscriptions, {
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
        `already saved. ${AT_URI_NOTE} ${AUTH_NOTE}` +
        " (or pass `did` to read another reader's public state).",
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
          .describe("Check this reader instead of the authorizing one."),
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
        if (!reader && !ctx.session.signedIn) {
          throw new InvalidInputError(
            "Pass `did`, or authorize this connection to check your own state.",
          );
        }
        const who = { did: reader };
        const { session } = ctx;

        const [articleStates, publicationStates, userStates] =
          await Promise.all([
            Promise.all(
              articles.map(async (input) => {
                const document = asAtUri(input, "articles");
                const [read, bookmarked, liked] = await Promise.all([
                  session.query(QUERY.getReadStatus, { ...who, document }),
                  session.query(QUERY.getBookmarkStatus, { ...who, document }),
                  session.query(QUERY.getRecommendStatus, { ...who, document }),
                ]);
                return {
                  uri: document,
                  read: activeOf(read),
                  bookmarked: activeOf(bookmarked),
                  liked: activeOf(liked),
                };
              }),
            ),
            Promise.all(
              publications.map(async (input) => {
                const status = await session.query(QUERY.getFollowStatus, {
                  ...who,
                  publication: asAtUri(input, "publications"),
                });
                return { uri: input, subscribed: activeOf(status) };
              }),
            ),
            Promise.all(
              users.map(async (input) => {
                const status = await session.query(QUERY.getUserFollowStatus, {
                  ...who,
                  subject: asDid(input, "users"),
                });
                return { did: input, following: activeOf(status) };
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
