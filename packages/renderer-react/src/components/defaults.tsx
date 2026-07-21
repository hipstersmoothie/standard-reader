import { createElement } from "react";

import { DefaultFacetText } from "../render/faceted-text";
import type { RendererComponents } from "./types";

/**
 * The default, unstyled component registry: semantic HTML with no class names,
 * inline styles, or theming. Data-backed platform embeds render nothing by
 * default — supply platform components to make them live. Everything here is
 * overridable through the `components` prop.
 */
export const defaultComponents: RendererComponents = {
  shared: {
    // Inline
    FacetText: DefaultFacetText,
    Strong: ({ children }) => <strong>{children}</strong>,
    Emphasis: ({ children }) => <em>{children}</em>,
    InlineCode: ({ children }) => <code>{children}</code>,
    Underline: ({ children }) => <u>{children}</u>,
    Strikethrough: ({ children }) => <s>{children}</s>,
    Highlight: ({ children }) => <mark>{children}</mark>,
    Link: ({ href, children }) => (
      <a href={href} rel="noopener noreferrer nofollow">
        {children}
      </a>
    ),
    // Mentions need resolution the headless package can't do; show the text.
    Mention: ({ children }) => <>{children}</>,
    FootnoteReference: ({ footnoteId, number, contentPlaintext }) =>
      number == null ? null : (
        <sup>
          <a
            id={`fnref-${footnoteId}`}
            href={`#fn-${footnoteId}`}
            title={contentPlaintext || undefined}
            aria-label={`Footnote ${number}`}
          >
            {number}
          </a>
        </sup>
      ),

    // Blocks
    Root: ({ children }) => <div dir="auto">{children}</div>,
    Paragraph: ({ children, dropCap }) => (
      <p data-drop-cap={dropCap || undefined}>{children}</p>
    ),
    Heading: ({ level, children }) =>
      createElement(`h${Math.min(6, Math.max(1, level))}`, null, children),
    Blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    Callout: ({ emoji, children }) => (
      <aside role="note">
        {emoji ? <span aria-hidden="true">{emoji} </span> : null}
        {children}
      </aside>
    ),
    HorizontalRule: () => <hr />,
    BulletList: ({ children }) => <ul>{children}</ul>,
    OrderedList: ({ start, children }) => <ol start={start}>{children}</ol>,
    ListItem: ({ children }) => <li>{children}</li>,
    TaskList: ({ children }) => <ul role="list">{children}</ul>,
    TaskListItem: ({ checked, children }) => (
      <li>
        <input type="checkbox" checked={checked ?? false} readOnly disabled />{" "}
        {children}
      </li>
    ),
    Code: ({ code, language }) => (
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {code}
        </code>
      </pre>
    ),
    Image: ({ src, alt, caption }) => (
      <figure>
        <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    ),
    Iframe: ({ url, height }) => (
      <iframe
        src={url}
        height={height}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        title="Embedded content"
      />
    ),
    Website: ({ src, title, description }) => (
      <a href={src} rel="noopener noreferrer nofollow">
        <span>{title || src}</span>
        {description ? <span>{description}</span> : null}
      </a>
    ),
    Table: ({ rows }) => (
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cell.header ? (
                  <th key={cellIndex} scope="col">
                    {cell.children}
                  </th>
                ) : (
                  <td key={cellIndex}>{cell.children}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    // Headless default renders the raw TeX; plug in KaTeX/MathML for display.
    Math: ({ tex }) => <code data-tex="">{tex}</code>,
    Button: ({ text, href, caption }) => (
      <span>
        <a href={href} role="button" rel="noopener noreferrer nofollow">
          {text}
        </a>
        {caption ? <small>{caption}</small> : null}
      </span>
    ),
    BlueskyEmbed: ({ postUri }) => (
      <a data-bluesky-embed={postUri} href={postUri}>
        {postUri}
      </a>
    ),
    ImageGrid: ({ images, caption }) => (
      <figure>
        {images.map((image, index) => (
          <img
            key={index}
            src={image.src}
            alt={image.alt}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ))}
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    ),
    ImageCarousel: ({ images, caption }) => (
      <figure>
        {images.map((image, index) => (
          <img
            key={index}
            src={image.src}
            alt={image.alt}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ))}
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    ),
    ImageDiff: ({ before, after, caption, labels }) => (
      <figure>
        <img
          src={before.src}
          alt={before.alt || labels?.[0] || ""}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <img
          src={after.src}
          alt={after.alt || labels?.[1] || ""}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    ),
    Footnotes: ({ children }) => (
      <section aria-label="Footnotes">
        <hr />
        <ol>{children}</ol>
      </section>
    ),
    FootnoteItem: ({ id, children }) => (
      <li id={`fn-${id}`}>
        {children}{" "}
        <a href={`#fnref-${id}`} aria-label="Back to content">
          ↩
        </a>
      </li>
    ),
    Unknown: () => null,
  },

  // Platform-specific blocks are typically interactive/data-backed. The
  // headless defaults render nothing (except structural ones); supply your own
  // to make them live.
  leaflet: {
    Poll: () => null,
    Signup: () => null,
    Separator: () => <hr />,
    StandardSitePost: () => null,
    StandardSitePublication: () => null,
    PageEmbed: ({ children }) => <div data-page-embed="">{children}</div>,
  },
  pckt: {
    Gallery: () => null,
    NoteEmbed: () => null,
  },
  offprint: {
    Component: () => null,
  },
};
