import { createServerFn } from "@tanstack/react-start";
import {
  getQuoteShareForDocument,
  upsertQuoteShare,
} from "#/server/reader/quote-shares";
import { z } from "zod";

const createQuoteShareInput = z.object({
  documentUri: z.string().min(1),
  quote: z.string().min(1),
});

const createQuoteShare = createServerFn({ method: "POST" })
  .validator(createQuoteShareInput)
  .handler(async ({ data }) => upsertQuoteShare(data.documentUri, data.quote));

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
