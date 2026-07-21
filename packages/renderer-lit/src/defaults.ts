import { segmentInline } from "@standard-reader/renderer-core";
import { html, nothing } from "lit";

import { renderInlineNodes } from "./inline";
import type { LitComponents, Renderable } from "./types";

function heading(level: number, children: Renderable): Renderable {
  switch (Math.min(6, Math.max(1, level))) {
    case 1: {
      return html`<h1>${children}</h1>`;
    }
    case 2: {
      return html`<h2>${children}</h2>`;
    }
    case 3: {
      return html`<h3>${children}</h3>`;
    }
    case 4: {
      return html`<h4>${children}</h4>`;
    }
    case 5: {
      return html`<h5>${children}</h5>`;
    }
    default: {
      return html`<h6>${children}</h6>`;
    }
  }
}

/**
 * The default, unstyled component registry: semantic HTML with no class names,
 * inline styles, or theming. Data-backed platform embeds render nothing by
 * default — supply platform components to make them live.
 */
export const defaultComponents: LitComponents = {
  shared: {
    // Inline
    facetText: (props, ctx) =>
      renderInlineNodes(
        segmentInline(
          { plaintext: props.plaintext, facets: props.facets },
          ctx.footnoteNumbers,
        ),
        ctx,
      ),
    strong: (children) => html`<strong>${children}</strong>`,
    emphasis: (children) => html`<em>${children}</em>`,
    inlineCode: (children) => html`<code>${children}</code>`,
    underline: (children) => html`<u>${children}</u>`,
    strikethrough: (children) => html`<s>${children}</s>`,
    highlight: (children) => html`<mark>${children}</mark>`,
    link: ({ href }, children) =>
      html`<a href=${href} rel="noopener noreferrer nofollow">${children}</a>`,
    // Mentions need resolution the headless package can't do; show the text.
    mention: (_props, children) => children,
    footnoteReference: ({ footnoteId, number, contentPlaintext }) =>
      number == null
        ? nothing
        : html`<sup
            ><a
              id=${`fnref-${footnoteId}`}
              href=${`#fn-${footnoteId}`}
              title=${contentPlaintext || nothing}
              aria-label=${`Footnote ${number}`}
              >${number}</a
            ></sup
          >`,

    // Blocks
    root: (children) => html`<div dir="auto">${children}</div>`,
    paragraph: ({ dropCap }, children) =>
      html`<p data-drop-cap=${dropCap ? "" : nothing}>${children}</p>`,
    heading: ({ level }, children) => heading(level, children),
    blockquote: (children) => html`<blockquote>${children}</blockquote>`,
    callout: ({ emoji }, children) =>
      html`<aside role="note">
        ${emoji
          ? html`<span aria-hidden="true">${emoji} </span>`
          : nothing}${children}
      </aside>`,
    horizontalRule: () => html`<hr />`,
    bulletList: (children) =>
      html`<ul>
        ${children}
      </ul>`,
    orderedList: ({ start }, children) =>
      html`<ol start=${start ?? nothing}>
        ${children}
      </ol>`,
    listItem: (children) => html`<li>${children}</li>`,
    taskList: (children) =>
      html`<ul role="list">
        ${children}
      </ul>`,
    taskListItem: ({ checked }, children) =>
      html`<li>
        <input type="checkbox" ?checked=${checked} readonly disabled />
        ${children}
      </li>`,
    code: ({ code, language }) =>
      html`<pre><code class=${language
        ? `language-${language}`
        : nothing}>${code}</code></pre>`,
    image: ({ src, alt, caption }) =>
      html`<figure>
        <img
          src=${src}
          alt=${alt}
          referrerpolicy="no-referrer"
          loading="lazy"
        />
        ${caption ? html`<figcaption>${caption}</figcaption>` : nothing}
      </figure>`,
    iframe: ({ url, height }) =>
      html`<iframe
        src=${url}
        height=${height ?? nothing}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        title="Embedded content"
      ></iframe>`,
    website: ({ src, title, description }) =>
      html`<a href=${src} rel="noopener noreferrer nofollow">
        <span>${title || src}</span>
        ${description ? html`<span>${description}</span>` : nothing}
      </a>`,
    table: ({ rows }) =>
      html`<table>
        <tbody>
          ${rows.map(
            (row) =>
              html`<tr>
                ${row.map((cell) =>
                  cell.header
                    ? html`<th scope="col">${cell.content}</th>`
                    : html`<td>${cell.content}</td>`,
                )}
              </tr>`,
          )}
        </tbody>
      </table>`,
    // Headless default renders the raw TeX; plug in KaTeX/MathML for display.
    math: ({ tex }) => html`<code data-tex="">${tex}</code>`,
    button: ({ text, href, caption }) =>
      html`<span
        ><a href=${href} role="button" rel="noopener noreferrer nofollow"
          >${text}</a
        >${caption ? html`<small>${caption}</small>` : nothing}</span
      >`,
    blueskyEmbed: ({ postUri }) =>
      html`<a data-bluesky-embed=${postUri} href=${postUri}>${postUri}</a>`,
    imageGrid: ({ images, caption }) =>
      html`<figure>
        ${images.map(
          (image) =>
            html`<img
              src=${image.src}
              alt=${image.alt}
              referrerpolicy="no-referrer"
              loading="lazy"
            />`,
        )}${caption ? html`<figcaption>${caption}</figcaption>` : nothing}
      </figure>`,
    imageCarousel: ({ images, caption }) =>
      html`<figure>
        ${images.map(
          (image) =>
            html`<img
              src=${image.src}
              alt=${image.alt}
              referrerpolicy="no-referrer"
              loading="lazy"
            />`,
        )}${caption ? html`<figcaption>${caption}</figcaption>` : nothing}
      </figure>`,
    imageDiff: ({ before, after, caption, labels }) =>
      html`<figure>
        <img
          src=${before.src}
          alt=${before.alt || labels?.[0] || ""}
          referrerpolicy="no-referrer"
          loading="lazy"
        />
        <img
          src=${after.src}
          alt=${after.alt || labels?.[1] || ""}
          referrerpolicy="no-referrer"
          loading="lazy"
        />
        ${caption ? html`<figcaption>${caption}</figcaption>` : nothing}
      </figure>`,
    footnotes: (children) =>
      html`<section aria-label="Footnotes">
        <hr />
        <ol>
          ${children}
        </ol>
      </section>`,
    footnoteItem: ({ id, number }, children) =>
      html`<li id=${`fn-${id}`} data-number=${number}>
        ${children}
        <a href=${`#fnref-${id}`} aria-label="Back to content">↩</a>
      </li>`,
    unknown: () => nothing,
  },

  leaflet: {
    poll: () => nothing,
    signup: () => nothing,
    separator: () => html`<hr />`,
    standardSitePost: () => nothing,
    standardSitePublication: () => nothing,
    pageEmbed: (_props, children) =>
      html`<div data-page-embed="">${children}</div>`,
  },
  pckt: {
    gallery: () => nothing,
    noteEmbed: () => nothing,
  },
  offprint: {
    component: () => nothing,
  },
};
