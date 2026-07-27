import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getReaderDidForRequest } from "#/middleware/auth-session.server";
import { getClientIp, rateLimiter } from "#/server/rate-limit";
import {
  getQuoteShareForDocument,
  upsertQuoteShare,
} from "#/server/reader/quote-shares";

const createQuoteShareInput = z.object({
  documentUri: z.string().min(1),
  quote: z.string().min(1),
});

/** Rate-limit window + limits for quote-share creation. */
const QUOTE_SHARE_WINDOW_MS = 60_000;
const QUOTE_SHARE_LIMIT_SIGNED_IN = 10;
const QUOTE_SHARE_LIMIT_SIGNED_OUT = 3;

const createQuoteShare = createServerFn({ method: "POST" })
  .validator(createQuoteShareInput)
  .handler(async ({ data }) => {
    const request = getRequest();
    const did = await getReaderDidForRequest(request);
    const key = did
      ? `quote-share:user:${did}`
      : `quote-share:ip:${getClientIp(request)}`;
    const limit = did
      ? QUOTE_SHARE_LIMIT_SIGNED_IN
      : QUOTE_SHARE_LIMIT_SIGNED_OUT;
    const { allowed, retryAfterMs } = rateLimiter.check(
      key,
      limit,
      QUOTE_SHARE_WINDOW_MS,
    );
    if (!allowed) {
      throw new Error(
        `Rate limit exceeded. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
      );
    }
    return upsertQuoteShare(data.documentUri, data.quote);
  });

const resolveQuoteShareInput = z.object({
  documentUri: z.string().min(1),
  id: z.string().min(1),
});

const resolveQuoteShare = createServerFn({ method: "GET" })
  .validator(resolveQuoteShareInput)
  .handler(async ({ data }) => {
    const quote = await getQuoteShareForDocument(data.id, data.documentUri);
    return quote ? { quote } : null;
  });

export const quoteShareApi = {
  createQuoteShare,
  resolveQuoteShare,
};
