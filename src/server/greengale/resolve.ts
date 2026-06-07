import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import {
  GREENGALE_CONTENT_REF,
  GREENGALE_DOCUMENT,
} from "#/lib/greengale/types";

import { fetchRepoRecord } from "../atproto/fetch-record";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve `app.greengale.document#contentRef` to inline markdown by fetching
 * the referenced `app.greengale.document` record from the authoring PDS.
 */
export async function resolveGreengaleContent(
  content: unknown,
  _did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  if (!isRecord(content) || content.$type !== GREENGALE_CONTENT_REF) {
    return content;
  }

  const uri = typeof content.uri === "string" ? content.uri : null;
  if (!uri || !pds) return content;

  const record = await fetchRepoRecord(pds, uri);
  if (!isRecord(record) || record.$type !== GREENGALE_DOCUMENT) {
    return content;
  }

  const markdown = typeof record.content === "string" ? record.content : null;
  if (!markdown?.trim()) return content;

  return {
    $type: STANDARD_MARKDOWN_CONTENT,
    text: markdown,
    version: "1.0",
  };
}
