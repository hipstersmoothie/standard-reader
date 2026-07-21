import { segmentInline } from "@standard-reader/renderer-core";
import h from "solid-js/h";

import { renderInlineNodes } from "./inline";
import type { Renderable, SolidComponents } from "./types";

function el(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: Array<Renderable>
): Renderable {
  // `solid-js/h` returns a thunk (`() => Node`) which Solid renders fine but
  // which its `JSX.Element` type doesn't include — cast once, here.
  const node = props === null ? h(tag, children) : h(tag, props, children);
  return node as unknown as Renderable;
}

/**
 * The default, unstyled component registry: semantic HTML with no class names,
 * inline styles, or theming. Data-backed platform embeds render nothing by
 * default — supply platform components to make them live.
 */
export const defaultComponents: SolidComponents = {
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
    strong: (children) => el("strong", null, children),
    emphasis: (children) => el("em", null, children),
    inlineCode: (children) => el("code", null, children),
    underline: (children) => el("u", null, children),
    strikethrough: (children) => el("s", null, children),
    highlight: (children) => el("mark", null, children),
    link: ({ href }, children) =>
      el("a", { href, rel: "noopener noreferrer nofollow" }, children),
    // Mentions need resolution the headless package can't do; show the text.
    mention: (_props, children) => children,
    footnoteReference: ({ footnoteId, number, contentPlaintext }) =>
      number == null
        ? null
        : el(
            "sup",
            null,
            el(
              "a",
              {
                id: `fnref-${footnoteId}`,
                href: `#fn-${footnoteId}`,
                title: contentPlaintext || undefined,
                "aria-label": `Footnote ${number}`,
              },
              number,
            ),
          ),

    // Blocks
    root: (children) => el("div", { dir: "auto" }, children),
    paragraph: ({ dropCap }, children) =>
      el("p", { "data-drop-cap": dropCap ? "" : undefined }, children),
    heading: ({ level }, children) =>
      el(`h${Math.min(6, Math.max(1, level))}`, null, children),
    blockquote: (children) => el("blockquote", null, children),
    callout: ({ emoji }, children) =>
      el(
        "aside",
        { role: "note" },
        emoji ? el("span", { "aria-hidden": "true" }, `${emoji} `) : null,
        children,
      ),
    horizontalRule: () => el("hr", null),
    bulletList: (children) => el("ul", null, children),
    orderedList: ({ start }, children) => el("ol", { start }, children),
    listItem: (children) => el("li", null, children),
    taskList: (children) => el("ul", null, children),
    taskListItem: ({ checked }, children) =>
      el(
        "li",
        null,
        el("input", { type: "checkbox", checked, disabled: true }),
        " ",
        children,
      ),
    code: ({ code, language }) =>
      el(
        "pre",
        null,
        el(
          "code",
          { class: language ? `language-${language}` : undefined },
          code,
        ),
      ),
    image: ({ src, alt, caption }) =>
      el(
        "figure",
        null,
        el("img", { src, alt, referrerpolicy: "no-referrer", loading: "lazy" }),
        caption ? el("figcaption", null, caption) : null,
      ),
    iframe: ({ url, height }) =>
      el("iframe", {
        src: url,
        height,
        loading: "lazy",
        sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
        title: "Embedded content",
      }),
    website: ({ src, title, description }) =>
      el(
        "a",
        { href: src, rel: "noopener noreferrer nofollow" },
        el("span", null, title || src),
        description ? el("span", null, description) : null,
      ),
    table: ({ rows }) =>
      el(
        "table",
        null,
        el(
          "tbody",
          null,
          rows.map((row) =>
            el(
              "tr",
              null,
              row.map((cell) =>
                cell.header
                  ? el("th", { scope: "col" }, cell.content)
                  : el("td", null, cell.content),
              ),
            ),
          ),
        ),
      ),
    // Headless default renders the raw TeX; plug in KaTeX/MathML for display.
    math: ({ tex }) => el("code", { "data-tex": "" }, tex),
    button: ({ text, href, caption }) =>
      el(
        "span",
        null,
        el("a", { href, rel: "noopener noreferrer nofollow" }, text),
        caption ? el("small", null, caption) : null,
      ),
    blueskyEmbed: ({ postUri }) =>
      el("a", { "data-bluesky-embed": postUri, href: postUri }, postUri),
    imageGrid: ({ images, caption }) =>
      el(
        "figure",
        null,
        images.map((image) =>
          el("img", {
            src: image.src,
            alt: image.alt,
            referrerpolicy: "no-referrer",
            loading: "lazy",
          }),
        ),
        caption ? el("figcaption", null, caption) : null,
      ),
    imageCarousel: ({ images, caption }) =>
      el(
        "figure",
        null,
        images.map((image) =>
          el("img", {
            src: image.src,
            alt: image.alt,
            referrerpolicy: "no-referrer",
            loading: "lazy",
          }),
        ),
        caption ? el("figcaption", null, caption) : null,
      ),
    imageDiff: ({ before, after, caption, labels }) =>
      el(
        "figure",
        null,
        el("img", {
          src: before.src,
          alt: before.alt || labels?.[0] || "",
          referrerpolicy: "no-referrer",
          loading: "lazy",
        }),
        el("img", {
          src: after.src,
          alt: after.alt || labels?.[1] || "",
          referrerpolicy: "no-referrer",
          loading: "lazy",
        }),
        caption ? el("figcaption", null, caption) : null,
      ),
    footnotes: (children) =>
      el(
        "section",
        { "aria-label": "Footnotes" },
        el("hr", null),
        el("ol", null, children),
      ),
    footnoteItem: ({ id, number }, children) =>
      el(
        "li",
        { id: `fn-${id}`, "data-number": number },
        children,
        " ",
        el("a", { href: `#fnref-${id}`, "aria-label": "Back to content" }, "↩"),
      ),
    unknown: () => null,
  },

  leaflet: {
    poll: () => null,
    signup: () => null,
    separator: () => el("hr", null),
    standardSitePost: () => null,
    standardSitePublication: () => null,
    pageEmbed: (_props, children) =>
      el("div", { "data-page-embed": "" }, children),
  },
  pckt: {
    gallery: () => null,
    noteEmbed: () => null,
  },
  offprint: {
    component: () => null,
  },
};
