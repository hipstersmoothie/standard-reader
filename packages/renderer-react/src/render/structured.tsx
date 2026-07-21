import { useComponents, useDocumentContext } from "../components/context";
import {
  structuredImageAspectRatio,
  structuredImageHasSource,
} from "../core/document/structured-content/image";
import type {
  StructuredRenderableBlock,
  StructuredText,
} from "../core/document/structured-content/types";
import type { TableRow } from "../types";
import { resolveGridImages } from "./image";

export function StructuredBlockList({
  blocks,
  dropCapIndex,
}: {
  blocks: Array<StructuredRenderableBlock>;
  dropCapIndex: number;
}) {
  return (
    <>
      {blocks.map((block, index) => (
        <StructuredBlock
          key={index}
          block={block}
          dropCap={index === dropCapIndex}
        />
      ))}
    </>
  );
}

/** Flatten a blockquote's nested blocks into quoted paragraph texts. */
function blockquoteParagraphs(
  blocks: Array<StructuredRenderableBlock>,
): Array<StructuredText> {
  return blocks.flatMap((block) => {
    if (block.kind === "text" || block.kind === "heading") {
      return block.text.plaintext.trim() ? [block.text] : [];
    }
    return [];
  });
}

export function StructuredBlock({
  block,
  dropCap = false,
}: {
  block: StructuredRenderableBlock;
  dropCap?: boolean;
}) {
  const { shared, offprint, pckt } = useComponents();
  const { authorDid, resolveImageUrl } = useDocumentContext();

  switch (block.kind) {
    case "text": {
      if (!block.text.plaintext) return null;
      return (
        <shared.Paragraph dropCap={dropCap}>
          <shared.FacetText
            plaintext={block.text.plaintext}
            facets={block.text.facets}
          />
        </shared.Paragraph>
      );
    }
    case "heading": {
      if (!block.text.plaintext) return null;
      return (
        <shared.Heading level={block.level ?? 2}>
          <shared.FacetText
            plaintext={block.text.plaintext}
            facets={block.text.facets}
          />
        </shared.Heading>
      );
    }
    case "blockquote": {
      const paragraphs = blockquoteParagraphs(block.blocks);
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
    case "callout":
      return (
        <shared.Callout emoji={block.emoji} color={block.color}>
          <shared.FacetText
            plaintext={block.text.plaintext}
            facets={block.text.facets}
          />
        </shared.Callout>
      );
    case "horizontalRule":
      return <shared.HorizontalRule />;
    case "bulletList":
      return (
        <shared.BulletList>
          {block.items.map((item, index) => (
            <shared.ListItem key={index}>
              <shared.FacetText
                plaintext={item.plaintext}
                facets={item.facets}
              />
            </shared.ListItem>
          ))}
        </shared.BulletList>
      );
    case "orderedList":
      return (
        <shared.OrderedList start={block.start}>
          {block.items.map((item, index) => (
            <shared.ListItem key={index}>
              <shared.FacetText
                plaintext={item.plaintext}
                facets={item.facets}
              />
            </shared.ListItem>
          ))}
        </shared.OrderedList>
      );
    case "taskList":
      return (
        <shared.TaskList>
          {block.items.map((item, index) => (
            <shared.TaskListItem key={index} checked={item.checked}>
              <shared.FacetText
                plaintext={item.text.plaintext}
                facets={item.text.facets}
              />
            </shared.TaskListItem>
          ))}
        </shared.TaskList>
      );
    case "blueskyEmbed":
      return <shared.BlueskyEmbed postUri={block.postUri} />;
    case "image": {
      if (!structuredImageHasSource(block)) return null;
      const src = resolveImageUrl({
        blob: block.blob,
        externalSrc: block.externalSrc,
        authorDid,
      });
      if (!src) return null;
      return (
        <shared.Image
          src={src}
          alt={block.alt?.trim() || ""}
          aspectRatio={structuredImageAspectRatio(block)}
        />
      );
    }
    case "code":
      return <shared.Code code={block.plaintext} language={block.language} />;
    case "iframe":
      return <shared.Iframe url={block.url} height={block.height} />;
    case "website":
      return (
        <shared.Website
          src={block.src}
          title={block.title}
          description={block.description}
          previewImage={block.previewImage}
        />
      );
    case "table": {
      const rows: Array<TableRow> = block.rows.map((row) =>
        row.map((cell) => ({
          header: cell.isHeader === true,
          children: (
            <shared.FacetText
              plaintext={cell.text.plaintext}
              facets={cell.text.facets}
            />
          ),
        })),
      );
      return <shared.Table rows={rows} />;
    }
    case "gallery":
      return <pckt.Gallery ref={block.ref} />;
    case "button":
      return (
        <shared.Button
          text={block.text}
          href={block.href}
          caption={block.caption}
          alignment={block.alignment}
        />
      );
    case "math":
      return <shared.Math tex={block.tex} />;
    case "imageGrid": {
      const images = resolveGridImages(
        block.images,
        resolveImageUrl,
        authorDid,
      );
      if (images.length === 0) return null;
      return <shared.ImageGrid images={images} caption={block.caption} />;
    }
    case "imageCarousel": {
      const images = resolveGridImages(
        block.images,
        resolveImageUrl,
        authorDid,
      );
      if (images.length === 0) return null;
      return <shared.ImageCarousel images={images} caption={block.caption} />;
    }
    case "imageDiff": {
      const images = resolveGridImages(
        block.images,
        resolveImageUrl,
        authorDid,
      );
      if (images.length !== 2) return null;
      const [before, after] = images;
      if (!before || !after) return null;
      return (
        <shared.ImageDiff
          before={before}
          after={after}
          caption={block.caption}
          labels={block.labels}
        />
      );
    }
    case "offprintComponent":
      return <offprint.Component componentUri={block.componentUri} />;
    case "unknown":
      return <shared.Unknown blockType={block.blockType} />;
  }
}
