import { segmentInline } from "@standard-reader/renderer-core";
import { h } from "vue";

import { renderInlineNodes } from "./inline";
import type { VueComponents } from "./types";

/**
 * The default, unstyled component registry: semantic HTML with no class names,
 * inline styles, or theming. Data-backed platform embeds render nothing by
 * default — supply platform components to make them live.
 *
 * Children are wrapped in arrays because Vue's `h()` children slot rejects a
 * bare `null`/`undefined` but accepts it inside a `VNodeArrayChildren`.
 */
export const defaultComponents: VueComponents = {
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
    strong: (children) => h("strong", [children]),
    emphasis: (children) => h("em", [children]),
    inlineCode: (children) => h("code", [children]),
    underline: (children) => h("u", [children]),
    strikethrough: (children) => h("s", [children]),
    highlight: (children) => h("mark", [children]),
    link: ({ href }, children) =>
      h("a", { href, rel: "noopener noreferrer nofollow" }, [children]),
    // Mentions need resolution the headless package can't do; show the text.
    mention: (_props, children) => children,
    footnoteReference: ({ footnoteId, number, contentPlaintext }) =>
      number == null
        ? null
        : h("sup", [
            h(
              "a",
              {
                id: `fnref-${footnoteId}`,
                href: `#fn-${footnoteId}`,
                title: contentPlaintext || undefined,
                "aria-label": `Footnote ${number}`,
              },
              number,
            ),
          ]),

    // Blocks
    root: (children) => h("div", { dir: "auto" }, [children]),
    paragraph: ({ dropCap }, children) =>
      h("p", { "data-drop-cap": dropCap ? "" : undefined }, [children]),
    heading: ({ level }, children) =>
      h(`h${Math.min(6, Math.max(1, level))}`, [children]),
    blockquote: (children) => h("blockquote", [children]),
    callout: ({ emoji }, children) =>
      h("aside", { role: "note" }, [
        emoji ? h("span", { "aria-hidden": "true" }, `${emoji} `) : null,
        children,
      ]),
    horizontalRule: () => h("hr"),
    bulletList: (children) => h("ul", [children]),
    orderedList: ({ start }, children) => h("ol", { start }, [children]),
    listItem: (children) => h("li", [children]),
    taskList: (children) => h("ul", [children]),
    taskListItem: ({ checked }, children) =>
      h("li", [
        h("input", { type: "checkbox", checked, disabled: true }),
        " ",
        children,
      ]),
    code: ({ code, language }) =>
      h("pre", [
        h("code", { class: language ? `language-${language}` : undefined }, [
          code,
        ]),
      ]),
    image: ({ src, alt, caption }) =>
      h("figure", [
        h("img", {
          src,
          alt,
          referrerpolicy: "no-referrer",
          loading: "lazy",
        }),
        caption ? h("figcaption", [caption]) : null,
      ]),
    iframe: ({ url, height }) =>
      h("iframe", {
        src: url,
        height,
        loading: "lazy",
        sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
        title: "Embedded content",
      }),
    website: ({ src, title, description }) =>
      h("a", { href: src, rel: "noopener noreferrer nofollow" }, [
        h("span", [title || src]),
        description ? h("span", [description]) : null,
      ]),
    table: ({ rows }) =>
      h("table", [
        h(
          "tbody",
          rows.map((row) =>
            h(
              "tr",
              row.map((cell) =>
                cell.header
                  ? h("th", { scope: "col" }, [cell.content])
                  : h("td", [cell.content]),
              ),
            ),
          ),
        ),
      ]),
    // Headless default renders the raw TeX; plug in KaTeX/MathML for display.
    math: ({ tex }) => h("code", { "data-tex": "" }, [tex]),
    button: ({ text, href, caption }) =>
      h("span", [
        h("a", { href, rel: "noopener noreferrer nofollow" }, [text]),
        caption ? h("small", [caption]) : null,
      ]),
    blueskyEmbed: ({ postUri }) =>
      h("a", { "data-bluesky-embed": postUri, href: postUri }, [postUri]),
    imageGrid: ({ images, caption }) =>
      h("figure", [
        ...images.map((image) =>
          h("img", {
            src: image.src,
            alt: image.alt,
            referrerpolicy: "no-referrer",
            loading: "lazy",
          }),
        ),
        caption ? h("figcaption", [caption]) : null,
      ]),
    imageCarousel: ({ images, caption }) =>
      h("figure", [
        ...images.map((image) =>
          h("img", {
            src: image.src,
            alt: image.alt,
            referrerpolicy: "no-referrer",
            loading: "lazy",
          }),
        ),
        caption ? h("figcaption", [caption]) : null,
      ]),
    imageDiff: ({ before, after, caption, labels }) =>
      h("figure", [
        h("img", {
          src: before.src,
          alt: before.alt || labels?.[0] || "",
          referrerpolicy: "no-referrer",
          loading: "lazy",
        }),
        h("img", {
          src: after.src,
          alt: after.alt || labels?.[1] || "",
          referrerpolicy: "no-referrer",
          loading: "lazy",
        }),
        caption ? h("figcaption", [caption]) : null,
      ]),
    footnotes: (children) =>
      h("section", { "aria-label": "Footnotes" }, [
        h("hr"),
        h("ol", [children]),
      ]),
    footnoteItem: ({ id, number }, children) =>
      h("li", { id: `fn-${id}`, "data-number": number }, [
        children,
        " ",
        h("a", { href: `#fnref-${id}`, "aria-label": "Back to content" }, [
          "↩",
        ]),
      ]),
    unknown: () => null,
  },

  leaflet: {
    poll: () => null,
    signup: () => null,
    separator: () => h("hr"),
    standardSitePost: () => null,
    standardSitePublication: () => null,
    pageEmbed: (_props, children) =>
      h("div", { "data-page-embed": "" }, [children]),
  },
  pckt: {
    gallery: () => null,
    noteEmbed: () => null,
  },
  offprint: {
    component: () => null,
  },
};
