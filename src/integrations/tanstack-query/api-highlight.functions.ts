import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { codeBlockKey } from "#/lib/code-highlight";
import { observe } from "#/server/observability/log";
import { highlightCodeBlock } from "#/server/shiki/highlighter";
import { z } from "zod";

const highlightInput = z.object({
  language: z.string().optional(),
  plaintext: z.string().min(1),
});

const highlightCode = createServerFn({ method: "POST" })
  .inputValidator(highlightInput)
  .handler(
    observe(
      "highlight.codeBlock",
      async ({ data }, span): Promise<string> => {
        span.set("language", data.language ?? "text");
        span.set("bytes", data.plaintext.length);
        return highlightCodeBlock(data.plaintext, data.language);
      },
    ),
  );

function highlightCodeQueryOptions(
  plaintext: string,
  language?: string,
) {
  const key = codeBlockKey({ language, plaintext });
  return queryOptions({
    queryKey: ["code-highlight", key] as const,
    queryFn: async () =>
      highlightCode({ data: { plaintext, language } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export const highlightApi = {
  highlightCode,
  highlightCodeQueryOptions,
};
