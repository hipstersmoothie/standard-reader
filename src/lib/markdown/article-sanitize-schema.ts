import type { Options as SanitizeSchema } from "rehype-sanitize";

import { defaultSchema } from "rehype-sanitize";

/** Allow Standard markdown HTML used by publishers (e.g. Wade Minter playlist cards). */
const playlistClass = /^playlist-/;

function mergeAttributes(
  tag: string,
  extra: NonNullable<SanitizeSchema["attributes"]>[string],
): NonNullable<SanitizeSchema["attributes"]>[string] {
  const base = defaultSchema.attributes?.[tag];
  const normalized = Array.isArray(base) ? base : base ? [base] : [];
  const additions = Array.isArray(extra) ? extra : [extra];
  return [...normalized, ...additions];
}

export const articleMarkdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "article", "iframe"],
  attributes: {
    ...defaultSchema.attributes,
    div: mergeAttributes("div", [["className", playlistClass]]),
    span: mergeAttributes("span", [["className", playlistClass]]),
    article: mergeAttributes("article", [["className", playlistClass]]),
    img: mergeAttributes("img", [["className", playlistClass]]),
    iframe: mergeAttributes("iframe", [
      "allow",
      "allowFullScreen",
      "frameBorder",
      "height",
      "referrerPolicy",
      "sandbox",
      "src",
      "title",
      "width",
    ]),
  },
};
