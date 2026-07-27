import { z } from "zod";

import { errorResult, jsonResult } from "../format";
import { QUERY } from "../methods";
import { asAtUri, asDid, asUrl } from "../refs";
import { AT_URI_NOTE, READ_ONLY } from "./context";
import type { ToolRegistrar } from "./context";

const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Page size. Defaults to the endpoint's own default (20-24).");

const cursor = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous page's `cursor` field.");

export const registerDiscoveryTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "search",
    {
      title: "Search Standard Reader",
      description:
        "Full-text search across indexed articles and/or publications. The " +
        "usual entry point when the user names something by title, topic or " +
        "author rather than by URI.",
      inputSchema: {
        query: z.string().min(1).describe("Free-text search query."),
        type: z
          .enum(["articles", "publications", "both"])
          .default("both")
          .describe("Which index to search. Defaults to both."),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    async ({ query, type, limit: max, cursor: at }) => {
      try {
        const params = { q: query, limit: max, cursor: at };
        const [articles, publications] = await Promise.all([
          type === "publications"
            ? undefined
            : ctx.session.query(QUERY.searchDocuments, params),
          type === "articles"
            ? undefined
            : ctx.session.query(QUERY.searchPublications, params),
        ]);
        return jsonResult({ articles, publications });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "resolve",
    {
      title: "Resolve a link, handle or DID",
      description:
        "Turn something the user pasted into indexed Standard Reader records. " +
        "Give it a web page URL to find the matching article or publication, " +
        "or an AT Protocol handle, domain or DID to find that account's " +
        "publications. Use this before any tool that wants an AT-URI.",
      inputSchema: {
        input: z
          .string()
          .min(1)
          .describe(
            "A web URL (https://…), or an AT Protocol handle, domain or DID.",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ input }) => {
      try {
        const value = input.trim();
        if (/^https?:\/\//i.test(value)) {
          return jsonResult(
            await ctx.session.query(QUERY.resolveUrl, {
              url: asUrl(value, "input"),
            }),
          );
        }
        return jsonResult(
          await ctx.session.query(QUERY.resolveHandle, {
            handle: value.replace(/^@/, ""),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_article",
    {
      title: "Get an article",
      description:
        "Fetch one article: card metadata, aggregate stats, and optionally the " +
        "full readable body and its reading-view context (related articles, " +
        `more from the publication, social proof). ${AT_URI_NOTE}`,
      inputSchema: {
        article: z.string().min(1).describe("Article AT-URI."),
        includeBody: z
          .boolean()
          .default(false)
          .describe(
            "Include the full renderable body. Large — only when summarising " +
              "or quoting the article itself.",
          ),
        includeContext: z
          .boolean()
          .default(false)
          .describe("Also fetch related articles, recents and citations."),
      },
      annotations: READ_ONLY,
    },
    async ({ article, includeBody, includeContext }) => {
      try {
        const document = asAtUri(article, "article");
        const [view, context] = await Promise.all([
          ctx.session.query(QUERY.getDocument, { document }),
          includeContext
            ? ctx.session.query(QUERY.getDocumentContext, { document })
            : undefined,
        ]);
        return jsonResult(
          { article: view, context },
          { includeContent: includeBody },
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_publication",
    {
      title: "Get a publication",
      description:
        "Fetch one publication's profile and stats, and optionally a page of " +
        `its articles or its subscribers. ${AT_URI_NOTE}`,
      inputSchema: {
        publication: z.string().min(1).describe("Publication AT-URI."),
        include: z
          .array(z.enum(["articles", "subscribers"]))
          .default([])
          .describe("Extra pages to fetch alongside the profile."),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    async ({ publication, include, limit: max, cursor: at }) => {
      try {
        const uri = asAtUri(publication, "publication");
        const page = { publication: uri, limit: max, cursor: at };
        const [profile, articles, subscribers] = await Promise.all([
          ctx.session.query(QUERY.getPublication, { publication: uri }),
          include.includes("articles")
            ? ctx.session.query(QUERY.getPublicationDocuments, page)
            : undefined,
          include.includes("subscribers")
            ? ctx.session.query(QUERY.getPublicationSubscribers, page)
            : undefined,
        ]);
        return jsonResult({
          ...(profile as Record<string, unknown>),
          articles,
          subscribers,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_author",
    {
      title: "Get an author",
      description:
        "Fetch an author's profile and aggregate stats by DID, and optionally " +
        "paged lists of the publications they own or every article they have " +
        "a byline on. Resolve a handle to a DID with `resolve` first.",
      inputSchema: {
        did: z.string().min(1).describe("Author DID (did:plc:… or did:web:…)."),
        include: z
          .array(z.enum(["publications", "articles"]))
          .default([])
          .describe(
            "Extra paged lists. The profile already carries a first page of " +
              "publications, so only ask for these when paging further.",
          ),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    async ({ did, include, limit: max, cursor: at }) => {
      try {
        const subject = asDid(did, "did");
        const page = { did: subject, limit: max, cursor: at };
        const [author, publicationsPage, articlesPage] = await Promise.all([
          ctx.session.query(QUERY.getAuthor, { did: subject }),
          include.includes("publications")
            ? ctx.session.query(QUERY.getAuthorPublications, page)
            : undefined,
          include.includes("articles")
            ? ctx.session.query(QUERY.getAuthorPosts, page)
            : undefined,
        ]);
        return jsonResult({
          ...(author as Record<string, unknown>),
          publicationsPage,
          articlesPage,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
