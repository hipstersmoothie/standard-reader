import { standardReader } from "@standard-reader/lexicons";
import { z } from "zod";

import { InvalidInputError } from "../errors.js";
import { errorResult, jsonResult, textResult } from "../format.js";
import { asAtUri, asDid } from "../refs.js";
import { AT_URI_NOTE, AUTH_NOTE } from "./context.js";
import type { ToolRegistrar } from "./context.js";

const WRITE = {
  openWorldHint: true,
  readOnlyHint: false,
  idempotentHint: true,
} as const;

export const registerWriteTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "bookmark",
    {
      title: "Bookmark an article",
      description:
        "Add an article to the signed-in reader's save-for-later queue, or " +
        "remove it. Writes an app.standard-reader.bookmark record to their " +
        `repo. ${AT_URI_NOTE} ${AUTH_NOTE}`,
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
        await ctx.sessions.require();
        const document = asAtUri(article, "article");
        if (action === "save") {
          await ctx.reader.client.call(standardReader.bookmarkDocument, {
            document,
          });
          return textResult(`Saved ${document} for later.`);
        }
        await ctx.reader.client.call(standardReader.unbookmarkDocument, {
          document,
        });
        return textResult(`Removed ${document} from the save queue.`);
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
        await ctx.sessions.require();
        const document = asAtUri(article, "article");
        if (action === "add") {
          await ctx.reader.client.call(standardReader.recommendDocument, {
            document,
          });
          return textResult(`Liked ${document}.`);
        }
        await ctx.reader.client.call(standardReader.unrecommendDocument, {
          document,
        });
        return textResult(`Unliked ${document}.`);
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
        "Update the signed-in reader's read state. `read`/`unread` act on one " +
        "article; `all` clears every unread article across their " +
        "subscriptions; `publication` clears one publication's backlog. " +
        `${AT_URI_NOTE} ${AUTH_NOTE}`,
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
        await ctx.sessions.require();
        const client = ctx.reader.client;

        switch (action) {
          case "read":
          case "unread": {
            if (!article) {
              throw new InvalidInputError(
                `action=${action} requires an \`article\` AT-URI.`,
              );
            }
            const document = asAtUri(article, "article");
            if (action === "read") {
              await client.call(standardReader.markRead, { document });
            } else {
              await client.call(standardReader.markUnread, { document });
            }
            return textResult(`Marked ${document} as ${action}.`);
          }
          case "all": {
            return jsonResult(
              await client.call(standardReader.markAllRead, {}),
            );
          }
          case "publication": {
            if (!publication) {
              throw new InvalidInputError(
                "action=publication requires a `publication` AT-URI.",
              );
            }
            return jsonResult(
              await client.call(standardReader.markPublicationAllRead, {
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
        "Subscribe the signed-in reader to a publication (pass its AT-URI) or " +
        "follow another reader (pass their DID), or undo either. The subject " +
        `type is inferred from what you pass. ${AT_URI_NOTE} ${AUTH_NOTE}`,
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
        await ctx.sessions.require();
        const client = ctx.reader.client;
        const value = subject.trim();

        if (value.startsWith("at://")) {
          const publication = asAtUri(value, "subject");
          if (action === "follow") {
            await client.call(standardReader.followPublication, {
              publication,
            });
            return textResult(`Subscribed to publication ${publication}.`);
          }
          await client.call(standardReader.unfollowPublication, {
            publication,
          });
          return textResult(`Unsubscribed from publication ${publication}.`);
        }

        if (value.startsWith("did:")) {
          const did = asDid(value, "subject");
          if (action === "follow") {
            await client.call(standardReader.followUser, { did });
            return textResult(`Now following ${did}.`);
          }
          await client.call(standardReader.unfollowUser, { did });
          return textResult(`Unfollowed ${did}.`);
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
        "Create, replace or delete one of the signed-in reader's publication " +
        "lists, or save/unsave someone else's list into their app. `update` " +
        "replaces the whole list, so send the full membership, not a delta — " +
        `read it back with \`get_lists\` first. ${AT_URI_NOTE} ${AUTH_NOTE}`,
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
        await ctx.sessions.require();
        const client = ctx.reader.client;
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
              await client.call(standardReader.createList, {
                name,
                publications: members,
                ...(description ? { description } : {}),
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
            await client.call(standardReader.updateList, {
              rkey,
              name,
              publications: members,
              ...(description ? { description } : {}),
            });
            return textResult(
              `Replaced list ${rkey} (${members.length} publications).`,
            );
          }
          case "delete": {
            if (!rkey) {
              throw new InvalidInputError("delete requires `rkey`.");
            }
            await client.call(standardReader.deleteList, { rkey });
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
            if (action === "save") {
              await client.call(standardReader.saveList, { list: uri });
              return textResult(`Saved list ${uri}.`);
            }
            await client.call(standardReader.unsaveList, { list: uri });
            return textResult(`Removed saved list ${uri}.`);
          }
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
