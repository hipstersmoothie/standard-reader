import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import type { PcktRenderableBlock } from "#/lib/pckt/types";

import { asTextBlock } from "#/lib/pckt/blocks";
import { PCKT_BLOCK } from "#/lib/pckt/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPcktBlock(block: PcktRenderableBlock): StructuredRenderableBlock {
  switch (block.kind) {
    case "text": {
      return {
        kind: "text",
        text: {
          plaintext: block.block.plaintext,
          facets: block.block.facets,
        },
      };
    }
    case "heading": {
      return {
        kind: "heading",
        level: block.block.level,
        text: {
          plaintext: block.block.plaintext,
          facets: block.block.facets,
        },
      };
    }
    case "blockquote": {
      return {
        kind: "blockquote",
        blocks: (block.block.content ?? []).flatMap((entry) => {
          const text = asTextBlock(entry);
          if (!text) return [];
          return [
            {
              kind: "text" as const,
              text: {
                plaintext: text.plaintext,
                facets: text.facets,
              },
            },
          ];
        }),
      };
    }
    case "horizontalRule": {
      return { kind: "horizontalRule" };
    }
    case "bulletList": {
      return {
        kind: "bulletList",
        items: (block.block.content ?? []).flatMap((child) => {
          if (!isRecord(child)) return [];
          const content = child.content as unknown;
          if (Array.isArray(content)) {
            return content.flatMap((entry) => {
              const text = asTextBlock(entry);
              return text?.plaintext.trim() ? [text] : [];
            });
          }
          const text = asTextBlock(content);
          return text?.plaintext.trim() ? [text] : [];
        }),
      };
    }
    case "orderedList": {
      return {
        kind: "orderedList",
        start: block.block.start,
        items: (block.block.content ?? []).flatMap((child) => {
          if (!isRecord(child)) return [];
          const content = child.content as unknown;
          if (Array.isArray(content)) {
            return content.flatMap((entry) => {
              const text = asTextBlock(entry);
              return text?.plaintext.trim() ? [text] : [];
            });
          }
          const text = asTextBlock(content);
          return text?.plaintext.trim() ? [text] : [];
        }),
      };
    }
    case "taskList": {
      return {
        kind: "taskList",
        items: (block.block.content ?? []).flatMap((child) => {
          if (!isRecord(child)) return [];
          const content = child.content as unknown;
          const texts = Array.isArray(content)
            ? content.flatMap((entry) => {
                const text = asTextBlock(entry);
                return text?.plaintext.trim() ? [text] : [];
              })
            : (() => {
                const text = asTextBlock(content);
                return text?.plaintext.trim() ? [text] : [];
              })();
          const [firstText] = texts;
          if (!firstText) return [];
          return [
            {
              checked: Boolean(
                isRecord(child.attrs) && child.attrs.checked === true,
              ),
              text: firstText,
            },
          ];
        }),
      };
    }
    case "blueskyEmbed": {
      return {
        kind: "blueskyEmbed",
        postUri: block.block.postRef?.uri ?? "",
      };
    }
    case "image": {
      return {
        kind: "image",
        blob: block.block.attrs?.blob,
        externalSrc: block.block.attrs?.src?.startsWith("blob:")
          ? undefined
          : block.block.attrs?.src,
        alt: block.block.attrs?.alt,
        aspectRatio: block.block.attrs?.aspectRatio,
      };
    }
    case "code": {
      return {
        kind: "code",
        plaintext: block.block.plaintext,
        language:
          block.block.language ?? block.block.attrs?.language ?? undefined,
      };
    }
    case "iframe": {
      return {
        kind: "iframe",
        url: block.block.url ?? "",
        height: block.block.height,
      };
    }
    case "website": {
      return {
        kind: "website",
        src: block.block.src ?? "",
        title: block.block.title,
        description: block.block.description,
        previewImage: block.block.previewImage,
      };
    }
    case "table": {
      const rows = (block.block.content ?? []).flatMap((row) => {
        if (!isRecord(row)) return [];
        const cells = row.content as Array<Record<string, unknown>> | undefined;
        if (!cells?.length) return [];
        const mapped = cells.flatMap((cell) => {
          const cellContent = cell.content as
            | Array<Record<string, unknown>>
            | undefined;
          const textBlock = cellContent
            ?.map((entry) => asTextBlock(entry))
            .find((entry) => entry?.plaintext.trim());
          if (!textBlock) return [];
          return [
            {
              isHeader: cell.$type === PCKT_BLOCK.tableHeader,
              text: {
                plaintext: textBlock.plaintext,
                facets: textBlock.facets,
              },
            },
          ];
        });
        return mapped.length > 0 ? [mapped] : [];
      });
      return { kind: "table", rows };
    }
    case "gallery": {
      return { kind: "unknown", blockType: "blog.pckt.block.gallery" };
    }
    case "unknown": {
      return { kind: "unknown", blockType: block.blockType };
    }
  }
}

export function structuredBlocksFromPckt(
  blocks: Array<PcktRenderableBlock>,
): Array<StructuredRenderableBlock> {
  return blocks.map((block) => mapPcktBlock(block));
}
