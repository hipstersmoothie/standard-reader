import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { observe } from "#/server/observability/log";
import { fetchDocumentComments } from "#/server/reader/document-comments";
import { z } from "zod";

import { dbMiddleware } from "./db-middleware";

export type {
  DocumentComment,
  DocumentCommentAuthor,
} from "#/server/reader/document-comments";

const documentCommentsInput = z.object({
  documentUri: z.string().min(1),
});

const getDocumentComments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentCommentsInput)
  .handler(
    observe("comments.getDocumentComments", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const comments = await fetchDocumentComments(
        context.db,
        context.schema,
        data.documentUri,
      );
      span.set("count", comments.length);
      return comments;
    }),
  );

function getDocumentCommentsQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["comments", documentUri] as const,
    queryFn: async () => getDocumentComments({ data: { documentUri } }),
    staleTime: 60_000,
  });
}

export const commentsApi = {
  getDocumentComments,
  getDocumentCommentsQueryOptions,
};
