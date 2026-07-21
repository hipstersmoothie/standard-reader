import { type ReactNode } from "react";

import { useComponents, useDocumentContext } from "../components/context";
import { asTextBlock, pcktCodeLanguage } from "../core/pckt/blocks";
import { pcktImageAlt, pcktImageAspectRatio } from "../core/pckt/image";
import type {
  PcktImageBlock,
  PcktListBlock,
  PcktRenderableBlock,
  PcktTableBlock,
  PcktTaskListBlock,
} from "../core/pckt/types";
import { PCKT_BLOCK } from "../core/pckt/types";
import type { ImageUrlResolver, TableRow } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function PcktBlockList({
  blocks,
  dropCapIndex,
}: {
  blocks: Array<PcktRenderableBlock>;
  dropCapIndex: number;
}) {
  return (
    <>
      {blocks.map((block, index) => (
        <PcktBlock key={index} block={block} dropCap={index === dropCapIndex} />
      ))}
    </>
  );
}

/** Resolve a pckt image (external `https`, `blob:CID` src, or a blob ref). */
function pcktImageSrc(
  block: PcktImageBlock,
  resolve: ImageUrlResolver,
  authorDid: string | undefined,
): string | null {
  const attrs = block.attrs;
  if (!attrs) return null;
  const src = attrs.src;
  if (typeof src === "string" && /^https?:\/\//i.test(src)) {
    return resolve({ externalSrc: src, authorDid });
  }
  let blob = attrs.blob;
  if (blob == null && typeof src === "string" && src.startsWith("blob:")) {
    const cid = src.slice("blob:".length);
    if (cid) blob = { ref: cid };
  }
  return resolve({ blob, authorDid });
}

export function PcktBlock({
  block,
  dropCap = false,
}: {
  block: PcktRenderableBlock;
  dropCap?: boolean;
}) {
  const { shared, pckt } = useComponents();
  const { authorDid, resolveImageUrl } = useDocumentContext();

  switch (block.kind) {
    case "text": {
      if (!block.block.plaintext) return null;
      return (
        <shared.Paragraph dropCap={dropCap}>
          <shared.FacetText
            plaintext={block.block.plaintext}
            facets={block.block.facets}
          />
        </shared.Paragraph>
      );
    }
    case "heading": {
      if (!block.block.plaintext) return null;
      return (
        <shared.Heading level={block.block.level ?? 2}>
          <shared.FacetText
            plaintext={block.block.plaintext}
            facets={block.block.facets}
          />
        </shared.Heading>
      );
    }
    case "blockquote": {
      const paragraphs = (block.block.content ?? []).flatMap((entry) => {
        const text = asTextBlock(entry);
        return text?.plaintext.trim()
          ? [{ plaintext: text.plaintext, facets: text.facets }]
          : [];
      });
      if (paragraphs.length === 0) return null;
      return (
        <shared.Blockquote>
          {paragraphs.map((text, index) => (
            <shared.Paragraph key={index}>
              <shared.FacetText
                plaintext={text.plaintext}
                facets={text.facets}
              />
            </shared.Paragraph>
          ))}
        </shared.Blockquote>
      );
    }
    case "horizontalRule":
      return <shared.HorizontalRule />;
    case "bulletList":
      return <PcktList block={block.block} ordered={false} />;
    case "orderedList":
      return <PcktList block={block.block} ordered />;
    case "taskList":
      return <PcktTaskList block={block.block} />;
    case "blueskyEmbed": {
      const uri = block.block.postRef?.uri;
      return uri ? <shared.BlueskyEmbed postUri={uri} /> : null;
    }
    case "image": {
      const src = pcktImageSrc(block.block, resolveImageUrl, authorDid);
      if (!src) return null;
      return (
        <shared.Image
          src={src}
          alt={pcktImageAlt(block.block)}
          aspectRatio={pcktImageAspectRatio(block.block)}
        />
      );
    }
    case "code":
      return (
        <shared.Code
          code={block.block.plaintext}
          language={pcktCodeLanguage(block.block)}
        />
      );
    case "iframe": {
      const url = block.block.url ?? block.block.attrs?.url ?? "";
      return <shared.Iframe url={url} height={block.block.height} />;
    }
    case "table":
      return <PcktTable block={block.block} />;
    case "website":
      return (
        <shared.Website
          src={block.block.src ?? ""}
          title={block.block.title}
          description={block.block.description}
          previewImage={block.block.previewImage}
        />
      );
    case "gallery": {
      const ref = block.block.ref;
      return ref ? <pckt.Gallery ref={ref} /> : null;
    }
    case "noteEmbed":
      return (
        <pckt.NoteEmbed
          uri={block.block.noteRef?.uri}
          cid={block.block.noteRef?.cid}
        />
      );
    case "unknown":
      return <shared.Unknown blockType={block.blockType} />;
  }
}

/** Render the inline content of a pckt list item / table cell. */
function PcktInlineContent({
  content,
}: {
  content: Array<Record<string, unknown>> | undefined;
}): ReactNode {
  const { shared } = useComponents();
  if (!content?.length) return null;
  return (
    <>
      {content.map((entry, index) => {
        const text = asTextBlock(entry);
        if (text?.plaintext.trim()) {
          return (
            <shared.FacetText
              key={index}
              plaintext={text.plaintext}
              facets={text.facets}
            />
          );
        }
        if (isRecord(entry) && entry.$type === PCKT_BLOCK.hardBreak) {
          return <br key={index} />;
        }
        if (isRecord(entry) && entry.$type === PCKT_BLOCK.bulletList) {
          return (
            <PcktList
              key={index}
              block={entry as PcktListBlock}
              ordered={false}
            />
          );
        }
        if (isRecord(entry) && entry.$type === PCKT_BLOCK.orderedList) {
          return (
            <PcktList key={index} block={entry as PcktListBlock} ordered />
          );
        }
        if (isRecord(entry) && entry.$type === PCKT_BLOCK.taskList) {
          return (
            <PcktTaskList key={index} block={entry as PcktTaskListBlock} />
          );
        }
        return null;
      })}
    </>
  );
}

function pcktListItems(
  content: PcktListBlock["content"],
): Array<{ key: number; content: Array<Record<string, unknown>> }> {
  return (content ?? []).flatMap((child, index) => {
    if (!isRecord(child)) return [];
    const itemContent = child.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!itemContent?.length) return [];
    return [{ key: index, content: itemContent }];
  });
}

function PcktList({
  block,
  ordered,
}: {
  block: PcktListBlock;
  ordered: boolean;
}) {
  const { shared } = useComponents();
  const items = pcktListItems(block.content);
  if (items.length === 0) return null;
  const rendered = items.map((item) => (
    <shared.ListItem key={item.key}>
      <PcktInlineContent content={item.content} />
    </shared.ListItem>
  ));
  return ordered ? (
    <shared.OrderedList start={block.start}>{rendered}</shared.OrderedList>
  ) : (
    <shared.BulletList>{rendered}</shared.BulletList>
  );
}

function PcktTaskList({ block }: { block: PcktTaskListBlock }) {
  const { shared } = useComponents();
  const items = (block.content ?? []).flatMap((child, index) => {
    if (!isRecord(child)) return [];
    const itemContent = child.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!itemContent?.length) return [];
    const checked = Boolean(
      isRecord(child.attrs) && child.attrs.checked === true,
    );
    return [{ key: index, content: itemContent, checked }];
  });
  if (items.length === 0) return null;
  return (
    <shared.TaskList>
      {items.map((item) => (
        <shared.TaskListItem key={item.key} checked={item.checked}>
          <PcktInlineContent content={item.content} />
        </shared.TaskListItem>
      ))}
    </shared.TaskList>
  );
}

function PcktTable({ block }: { block: PcktTableBlock }) {
  const { shared } = useComponents();
  const rows = block.content ?? [];
  if (rows.length === 0) return null;
  const tableRows: Array<TableRow> = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const cells = row.content as Array<Record<string, unknown>> | undefined;
    if (!cells?.length) continue;
    tableRows.push(
      cells.flatMap((cell) => {
        if (!isRecord(cell)) return [];
        const header = cell.$type === PCKT_BLOCK.tableHeader;
        const cellContent = cell.content as
          | Array<Record<string, unknown>>
          | undefined;
        return [
          {
            header,
            children: <PcktInlineContent content={cellContent} />,
          },
        ];
      }),
    );
  }
  if (tableRows.length === 0) return null;
  return <shared.Table rows={tableRows} />;
}
