import { z } from "zod";

import { InvalidInputError } from "../errors";
import { errorResult, jsonResult, textResult } from "../format";
import { PROCEDURE } from "../methods";
import { asAtUri, asDid } from "../refs";
import { AT_URI_NOTE, AUTH_NOTE, WRITE } from "./context";
import type { ToolRegistrar } from "./context";

export const registerWriteTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "bookmark",
    {
      title: "Bookmark an article",
      description:
        "Add an article to the reader's save-for-later queue, or remove it. " +
        "Writes an app.standard-reader.bookmark record to their own AT " +
        `Protocol repo, which is public on the network. ${AT_URI_NOTE} ` +
        AUTH_NOTE,
      inputSchema: {
        article: z.string().min(1).describe("Article AT-URI."),
        action: z
          .enum(["save", "remove"])
          .default("save")
          .describe("save adds to the queue; remove takes it out."),
      },
      annotations: WRITE,
    },
    async ({ article, action }) => {
      try {
        const document = asAtUri(article, "article");
        await ctx.session.write(
          action === "save"
            ? PROCEDURE.bookmarkDocument
            : PROCEDURE.unbookmarkDocument,
          { document },
        );
        return textResult(
          action === "save"
            ? `Saved ${document} for later.`
            : `Removed ${document} from the save queue.`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "like",
    {
      title: "Like an article",
      description:
        "Recommend (like) an article on the network so it counts towards its " +
        "public recommendation total and shows up for the reader's followers, " +
        `or undo that. ${AT_URI_NOTE} ${AUTH_NOTE}`,
      inputSchema: {
        article: z.string().min(1).describe("Article AT-URI."),
        action: z.enum(["add", "remove"]).default("add"),
      },
      annotations: WRITE,
    },
    async ({ article, action }) => {
      try {
        const document = asAtUri(article, "article");
        await ctx.session.write(
          action === "add"
            ? PROCEDURE.recommendDocument
            : PROCEDURE.unrecommendDocument,
          { document },
        );
        return textResult(
          action === "add" ? `Liked ${document}.` : `Unliked ${document}.`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "mark_read",
    {
      title: "Mark articles read or unread",
      description:
        "Update the reader's read state. `read`/`unread` act on one article; " +
        "`all` clears every unread article across their subscriptions; " +
        "`publication` clears one publication's backlog. `all` can touch a " +
        `large backlog — confirm before using it. ${AT_URI_NOTE} ${AUTH_NOTE}`,
      inputSchema: {
        action: z
          .enum(["read", "unread", "all", "publication"])
          .describe("Which read-state change to apply."),
        article: z
          .string()
          .optional()
          .describe("Article AT-URI. Required for read/unread."),
        publication: z
          .string()
          .optional()
          .describe("Publication AT-URI. Required for action=publication."),
      },
      annotations: { ...WRITE, destructiveHint: false },
    },
    async ({ action, article, publication }) => {
      try {
        const { session } = ctx;

        switch (action) {
          case "read":
          case "unread": {
            if (!article) {
              throw new InvalidInputError(
                `action=${action} requires an \`article\` AT-URI.`,
              );
            }
            const document = asAtUri(article, "article");
            await session.write(
              action === "read" ? PROCEDURE.markRead : PROCEDURE.markUnread,
              { document },
            );
            return textResult(`Marked ${document} as ${action}.`);
          }
          case "all": {
            return jsonResult(await session.write(PROCEDURE.markAllRead));
          }
          case "publication": {
            if (!publication) {
              throw new InvalidInputError(
                "action=publication requires a `publication` AT-URI.",
              );
            }
            return jsonResult(
              await session.write(PROCEDURE.markPublicationAllRead, {
                publication: asAtUri(publication, "publication"),
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
    "follow",
    {
      title: "Follow a publication or reader",
      description:
        "Subscribe the reader to a publication (pass its AT-URI) or follow " +
        "another reader (pass their DID), or undo either. The subject type is " +
        `inferred from what you pass. ${AT_URI_NOTE} ${AUTH_NOTE}`,
      inputSchema: {
        subject: z
          .string()
          .min(1)
          .describe(
            "A publication AT-URI (at://…) or a user DID (did:plc:… / " +
              "did:web:…). Resolve a handle to a DID with `resolve` first.",
          ),
        action: z.enum(["follow", "unfollow"]).default("follow"),
      },
      annotations: WRITE,
    },
    async ({ subject, action }) => {
      try {
        const { session } = ctx;
        const value = subject.trim();

        if (value.startsWith("at://")) {
          const publication = asAtUri(value, "subject");
          await session.write(
            action === "follow"
              ? PROCEDURE.followPublication
              : PROCEDURE.unfollowPublication,
            { publication },
          );
          return textResult(
            action === "follow"
              ? `Subscribed to publication ${publication}.`
              : `Unsubscribed from publication ${publication}.`,
          );
        }

        if (value.startsWith("did:")) {
          const did = asDid(value, "subject");
          await session.write(
            action === "follow" ? PROCEDURE.followUser : PROCEDURE.unfollowUser,
            { did },
          );
          return textResult(
            action === "follow"
              ? `Now following ${did}.`
              : `Unfollowed ${did}.`,
          );
        }

        throw new InvalidInputError(
          "`subject` must be a publication AT-URI (at://…) or a user DID " +
            "(did:…). Use `resolve` to turn a handle or link into one.",
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "manage_list",
    {
      title: "Manage publication lists",
      description:
        "Create, replace or delete one of the reader's publication lists, or " +
        "save/unsave someone else's list into their app. `update` replaces " +
        "the whole list, so send the full membership, not a delta — read it " +
        `back with \`get_lists\` first. ${AT_URI_NOTE} ${AUTH_NOTE}`,
      inputSchema: {
        action: z
          .enum(["create", "update", "delete", "save", "unsave"])
          .describe("What to do."),
        name: z
          .string()
          .optional()
          .describe("List name. Required for create and update."),
        description: z.string().optional().describe("Optional list blurb."),
        publications: z
          .array(z.string())
          .optional()
          .describe(
            "Full set of member publication AT-URIs. Required for create and " +
              "update; update replaces the previous membership entirely.",
          ),
        rkey: z
          .string()
          .optional()
          .describe(
            "Record key of the reader's own list. Required for update and " +
              "delete; it is the last segment of the list's AT-URI.",
          ),
        list: z
          .string()
          .optional()
          .describe(
            "Another reader's list AT-URI. Required for save and unsave.",
          ),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    async ({ action, name, description, publications, rkey, list }) => {
      try {
        const { session } = ctx;
        const members = publications?.map((uri) =>
          asAtUri(uri, "publications"),
        );

        switch (action) {
          case "create": {
            if (!name || !members) {
              throw new InvalidInputError(
                "create requires `name` and `publications`.",
              );
            }
            return jsonResult(
              await session.write(PROCEDURE.createList, {
                name,
                publications: members,
                description,
              }),
            );
          }
          case "update": {
            if (!rkey || !name || !members) {
              throw new InvalidInputError(
                "update requires `rkey`, `name` and the full `publications` " +
                  "set.",
              );
            }
            await session.write(PROCEDURE.updateList, {
              rkey,
              name,
              publications: members,
              description,
            });
            return textResult(
              `Replaced list ${rkey} (${members.length} publications).`,
            );
          }
          case "delete": {
            if (!rkey) {
              throw new InvalidInputError("delete requires `rkey`.");
            }
            await session.write(PROCEDURE.deleteList, { rkey });
            return textResult(`Deleted list ${rkey}.`);
          }
          case "save":
          case "unsave": {
            if (!list) {
              throw new InvalidInputError(
                `${action} requires a \`list\` AT-URI.`,
              );
            }
            const uri = asAtUri(list, "list");
            await session.write(
              action === "save" ? PROCEDURE.saveList : PROCEDURE.unsaveList,
              { list: uri },
            );
            return textResult(
              action === "save"
                ? `Saved list ${uri}.`
                : `Removed saved list ${uri}.`,
            );
          }
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
