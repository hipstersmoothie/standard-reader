"use client";

import type { StandardSiteDocument } from "@standard-reader/renderer-core";
import type {
  BlockquoteProps,
  BlueskyEmbedProps,
  ButtonProps,
  CalloutProps,
  CodeProps,
  FacetTextProps,
  FootnoteItemProps,
  FootnotesProps,
  HeadingProps,
  IframeProps,
  ImageCollectionProps,
  ImageDiffProps,
  ImageProps,
  LeafletPageEmbedProps,
  LeafletPollProps,
  LeafletStandardSitePostProps,
  LeafletStandardSitePublicationProps,
  ListItemProps,
  ListProps,
  MathProps,
  OffprintComponentProps,
  OrderedListProps,
  ParagraphProps,
  PcktGalleryProps,
  PcktNoteEmbedProps,
  RendererComponentsInput,
  RootProps,
  TableProps,
  TaskListItemProps,
  UnknownBlockProps,
  WebsiteProps,
} from "@standard-reader/renderer-react";
import * as stylex from "@stylexjs/stylex";
import { createElement } from "react";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import { articleBodyStyles } from "./body-styles";
import { LeafletPollBlockView } from "./renderers/leaflet-poll";
import { LeafletSeparatorView } from "./renderers/leaflet-separator";
import { LeafletSignupBlockView } from "./renderers/leaflet-signup";
import { LeafletStandardSitePostBlockView } from "./renderers/leaflet-standard-site-post";
import { LeafletStandardSitePublicationBlockView } from "./renderers/leaflet-standard-site-publication";
import { OffprintComponentBlockView } from "./renderers/offprint-component";
import { PcktGalleryBlockView } from "./renderers/pckt-gallery";
import { PcktNoteEmbedView } from "./renderers/pckt-note-embed";
import { BskyPostEmbedView } from "./renderers/shared/bsky-post-embed";
import { CodeBlockView } from "./renderers/shared/code-block";
import { FacetedPlaintext } from "./renderers/shared/faceted-text";
import { IframeEmbedView } from "./renderers/shared/iframe-embed";
import { ImageFigureView } from "./renderers/shared/image-figure";
import { StructuredButtonBlockView } from "./renderers/shared/structured-button";
import { StructuredMathBlockView } from "./renderers/shared/structured-math";
import { UnknownBlockView } from "./renderers/shared/unknown-block";
import { StructuredWebsiteView } from "./renderers/structured-views";
import type { ContentBlobContext } from "./types";

const styles = stylex.create({
  galleryGrid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  },
  diffPair: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "1fr 1fr",
  },
});

/**
 * Build the Standard Reader design-system components for
 * `@standard-reader/renderer-react`. This is where the app supplies its own
 * styled, interactive components for every block and inline mark — the headless
 * package handles parsing and dispatch, the app owns the look and behavior.
 *
 * Inline rich text (bold/links/mentions/footnotes) is delegated to the app's
 * {@link FacetedPlaintext}, so mentions, smart links and footnote references all
 * work exactly as they do in the native reader. Data-backed platform embeds map
 * to the app's live components, closing over the document's blob context.
 */
export function buildStandardReaderComponents({
  blobContext,
  codeHighlights,
}: {
  blobContext: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
}): RendererComponentsInput {
  return {
    shared: {
      // Reuse the app's rich inline renderer for every faceted run.
      FacetText: ({ plaintext, facets }: FacetTextProps) => (
        <FacetedPlaintext plaintext={plaintext} facets={facets} />
      ),
      Root: ({ children }: RootProps) => <div dir="auto">{children}</div>,
      Paragraph: ({ children, dropCap }: ParagraphProps) => (
        <p
          {...stylex.props(
            articleBodyStyles.paragraph,
            dropCap && articleBodyStyles.dropCapParagraph,
          )}
        >
          {children}
        </p>
      ),
      Heading: ({ level, children }: HeadingProps) =>
        createElement(
          `h${Math.min(6, Math.max(1, level))}`,
          stylex.props(
            level <= 1
              ? articleBodyStyles.heading1
              : articleBodyStyles.heading2,
          ),
          children,
        ),
      Blockquote: ({ children }: BlockquoteProps) => (
        <blockquote {...stylex.props(articleBodyStyles.pullquote)}>
          {children}
        </blockquote>
      ),
      Callout: ({ emoji, children }: CalloutProps) => (
        <aside {...stylex.props(articleBodyStyles.callout)} role="note">
          {emoji ? (
            <span {...stylex.props(articleBodyStyles.calloutEmoji)} aria-hidden>
              {emoji}
            </span>
          ) : null}
          <div {...stylex.props(articleBodyStyles.calloutBody)}>{children}</div>
        </aside>
      ),
      HorizontalRule: () => (
        <hr {...stylex.props(articleBodyStyles.horizontalRule)} />
      ),
      BulletList: ({ children }: ListProps) => (
        <ul {...stylex.props(articleBodyStyles.list)}>{children}</ul>
      ),
      OrderedList: ({ start, children }: OrderedListProps) => (
        <ol {...stylex.props(articleBodyStyles.list)} start={start ?? 1}>
          {children}
        </ol>
      ),
      ListItem: ({ children }: ListItemProps) => (
        <li {...stylex.props(articleBodyStyles.listItem)}>{children}</li>
      ),
      TaskList: ({ children }: ListProps) => (
        <ul {...stylex.props(articleBodyStyles.taskList)}>{children}</ul>
      ),
      TaskListItem: ({ checked, children }: TaskListItemProps) => (
        <li {...stylex.props(articleBodyStyles.taskItem)}>
          <input
            type="checkbox"
            checked={checked ?? false}
            readOnly
            aria-hidden
            tabIndex={-1}
            {...stylex.props(articleBodyStyles.taskCheckbox)}
          />
          <span>{children}</span>
        </li>
      ),
      Code: ({ code, language }: CodeProps) => (
        <CodeBlockView
          plaintext={code}
          language={language}
          codeHighlights={codeHighlights}
        />
      ),
      Image: ({ src, alt, aspectRatio, fullBleed }: ImageProps) => (
        <ImageFigureView
          src={src}
          alt={alt}
          aspectRatio={aspectRatio}
          fullBleed={fullBleed}
          lightboxEnabled
          fit="natural"
        />
      ),
      Iframe: ({ url, height, aspectRatio }: IframeProps) => (
        <IframeEmbedView url={url} height={height} aspectRatio={aspectRatio} />
      ),
      Website: ({ src, title, description, previewImage }: WebsiteProps) => (
        <StructuredWebsiteView
          src={src}
          title={title}
          description={description}
          previewImage={previewImage}
        />
      ),
      Table: ({ rows }: TableProps) => (
        <table {...stylex.props(articleBodyStyles.table)}>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) =>
                  cell.header ? (
                    <th
                      key={cellIndex}
                      scope="col"
                      {...stylex.props(
                        articleBodyStyles.tableCell,
                        articleBodyStyles.tableHeaderCell,
                      )}
                    >
                      {cell.children}
                    </th>
                  ) : (
                    <td
                      key={cellIndex}
                      {...stylex.props(articleBodyStyles.tableCell)}
                    >
                      {cell.children}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ),
      Math: ({ tex }: MathProps) => <StructuredMathBlockView tex={tex} />,
      Button: ({ text, href, caption, alignment }: ButtonProps) => (
        <StructuredButtonBlockView
          text={text}
          href={href}
          caption={caption}
          alignment={alignment}
        />
      ),
      BlueskyEmbed: ({ postUri }: BlueskyEmbedProps) => (
        <BskyPostEmbedView postUri={postUri} />
      ),
      ImageGrid: ({ images }: ImageCollectionProps) => (
        <figure {...stylex.props(articleBodyStyles.gallery)}>
          <div {...stylex.props(styles.galleryGrid)}>
            {images.map((image, index) => (
              <ImageFigureView
                key={index}
                src={image.src}
                alt={image.alt}
                aspectRatio={image.aspectRatio}
                fit="cover"
                lightboxEnabled
              />
            ))}
          </div>
        </figure>
      ),
      ImageCarousel: ({ images }: ImageCollectionProps) => (
        <figure {...stylex.props(articleBodyStyles.gallery)}>
          <div {...stylex.props(articleBodyStyles.galleryCarousel)}>
            {images.map((image, index) => (
              <ImageFigureView
                key={index}
                src={image.src}
                alt={image.alt}
                aspectRatio={image.aspectRatio}
                fit="cover"
                lightboxEnabled
              />
            ))}
          </div>
        </figure>
      ),
      ImageDiff: ({ before, after }: ImageDiffProps) => (
        <figure {...stylex.props(articleBodyStyles.imageDiff)}>
          <div {...stylex.props(styles.diffPair)}>
            <ImageFigureView
              src={before.src}
              alt={before.alt}
              aspectRatio={before.aspectRatio}
              fit="cover"
            />
            <ImageFigureView
              src={after.src}
              alt={after.alt}
              aspectRatio={after.aspectRatio}
              fit="cover"
            />
          </div>
        </figure>
      ),
      Footnotes: ({ children }: FootnotesProps) => (
        <section
          {...stylex.props(articleBodyStyles.footnotes)}
          aria-label="Footnotes"
        >
          <hr {...stylex.props(articleBodyStyles.footnotesDivider)} />
          <ol {...stylex.props(articleBodyStyles.footnotesList)}>{children}</ol>
        </section>
      ),
      FootnoteItem: ({ id, children }: FootnoteItemProps) => (
        <li id={`fn-${id}`} {...stylex.props(articleBodyStyles.footnotesItem)}>
          {children}{" "}
          <a
            href={`#fnref-${id}`}
            aria-label="Back to content"
            {...stylex.props(articleBodyStyles.footnoteBackLink)}
          >
            ↩
          </a>
        </li>
      ),
      Unknown: ({ blockType }: UnknownBlockProps) => (
        <UnknownBlockView blockType={blockType} />
      ),
    },
    leaflet: {
      Poll: ({ pollUri }: LeafletPollProps) => (
        <LeafletPollBlockView block={{ pollRef: { uri: pollUri } }} />
      ),
      Signup: () => <LeafletSignupBlockView />,
      Separator: () => <LeafletSeparatorView />,
      StandardSitePost: ({ uri }: LeafletStandardSitePostProps) => (
        <LeafletStandardSitePostBlockView block={{ uri }} />
      ),
      StandardSitePublication: ({
        uri,
        cid,
        showPublicationTheme,
      }: LeafletStandardSitePublicationProps) => (
        <LeafletStandardSitePublicationBlockView
          block={{ uri, cid, showPublicationTheme }}
        />
      ),
      PageEmbed: ({ children }: LeafletPageEmbedProps) => (
        <div {...stylex.props(articleBodyStyles.pageEmbedBlockInner)}>
          {children}
        </div>
      ),
    },
    pckt: {
      Gallery: ({ ref }: PcktGalleryProps) => (
        <PcktGalleryBlockView block={{ ref }} blobContext={blobContext} />
      ),
      NoteEmbed: ({ uri, cid }: PcktNoteEmbedProps) => (
        <PcktNoteEmbedView noteRef={{ uri, cid }} />
      ),
    },
    offprint: {
      Component: ({ componentUri }: OffprintComponentProps) => (
        <OffprintComponentBlockView componentUri={componentUri} />
      ),
    },
  };
}

/** Map an {@link ArticleDetail} onto the package's document input. */
export function articleToStandardDocument(
  article: ArticleDetail,
): StandardSiteDocument {
  return {
    content: article.contentJson,
    contentFormat: article.contentFormat,
    authorDid: article.did,
    description: article.description,
  };
}
