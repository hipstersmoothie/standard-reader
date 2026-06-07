import type { ResolvedThemeScheme } from "#/lib/theme";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { codeBlockKey } from "#/lib/code-highlight";
import { observe } from "#/server/observability/log";
import { highlightCodeBlock } from "#/server/shiki/highlighter";
import { z } from "zod";

const highlightInput = z.object({
  language: z.string().optional(),
  plaintext: z.string().min(1),
  scheme: z.enum(["light", "dark"]).default("light"),
});

const highlightCode = createServerFn({ method: "POST" })
  .inputValidator(highlightInput)
  .handler(
    observe("highlight.codeBlock", async ({ data }, span): Promise<string> => {
      span.set("language", data.language ?? "text");
      span.set("bytes", data.plaintext.length);
      return highlightCodeBlock(data.plaintext, data.language, data.scheme);
    }),
  );

function highlightCodeQueryOptions(
  plaintext: string,
  language: string | undefined,
  scheme: ResolvedThemeScheme,
) {
  const key = codeBlockKey({ language, plaintext });
  return queryOptions({
    queryKey: ["code-highlight", scheme, key] as const,
    queryFn: async () =>
      highlightCode({ data: { plaintext, language, scheme } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export const highlightApi = {
  highlightCode,
  highlightCodeQueryOptions,
};
