import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "pullquote"; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blockFromUnknown(value: unknown): ArticleBlock | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { type: "paragraph", text } : null;
  }
  if (!isRecord(value)) return null;
  if (typeof value.pull === "string" && value.pull.trim()) {
    return { type: "pullquote", text: value.pull.trim() };
  }
  if (value.type === "pullquote" && typeof value.text === "string") {
    const text = value.text.trim();
    return text ? { type: "pullquote", text } : null;
  }
  if (typeof value.text === "string" && value.text.trim()) {
    return { type: "paragraph", text: value.text.trim() };
  }
  if (typeof value.plaintext === "string" && value.plaintext.trim()) {
    return { type: "paragraph", text: value.plaintext.trim() };
  }
  return null;
}

function blocksFromJson(contentJson: JsonValue): Array<ArticleBlock> | null {
  if (contentJson == null) return null;

  if (Array.isArray(contentJson)) {
    const blocks = contentJson
      .map((value) => blockFromUnknown(value))
      .filter((block): block is ArticleBlock => block != null);
    return blocks.length > 0 ? blocks : null;
  }

  if (!isRecord(contentJson)) return null;

  const children =
    contentJson.blocks ?? contentJson.children ?? contentJson.body;
  if (Array.isArray(children)) {
    const blocks = children
      .map((value) => blockFromUnknown(value))
      .filter((block): block is ArticleBlock => block != null);
    return blocks.length > 0 ? blocks : null;
  }

  const single = blockFromUnknown(contentJson);
  return single ? [single] : null;
}

function blocksFromText(textContent: string): Array<ArticleBlock> {
  const normalized = textContent.replaceAll("\r\n", "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const blocks: Array<ArticleBlock> = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const quoteMatch = /^>\s?(.+)$/s.exec(trimmed);
    if (quoteMatch?.[1]) {
      blocks.push({ type: "pullquote", text: quoteMatch[1].trim() });
      continue;
    }

    blocks.push({ type: "paragraph", text: trimmed });
  }

  return blocks;
}

/** Turn stored document content into searchable/renderable blocks. */
export function parseArticleBlocks({
  textContent,
  contentJson,
}: {
  textContent: string | null;
  contentJson: JsonValue;
}): Array<ArticleBlock> {
  const fromJson = blocksFromJson(contentJson);
  if (fromJson?.length) return fromJson;
  if (textContent?.trim()) return blocksFromText(textContent);
  return [];
}

export function blocksPlaintext(blocks: Array<ArticleBlock>): string | null {
  if (blocks.length === 0) return null;
  const text = blocks
    .map((block) => block.text)
    .join("\n\n")
    .trim();
  return text || null;
}
