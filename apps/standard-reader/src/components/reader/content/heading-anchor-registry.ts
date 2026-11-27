"use client";

import { createContext, use, useId } from "react";

import type { HeadingOutlineEntry } from "#/lib/document/heading-outline";
import { normalizeHeadingText } from "#/lib/document/heading-outline";

/**
 * Hands each rendered heading the anchor id its outline entry was given.
 *
 * Headings are matched by text, not position: every content renderer has its
 * own block walk (Leaflet, pckt, structured, `renderer-react`, react-markdown),
 * and threading an index through all of them would couple each one to the
 * table of contents. A heading whose text isn't in the outline — a canvas
 * heading, one inside a collapsed page embed — simply gets no id.
 *
 * Two headings with the same text share a text key, so those are handed out in
 * render order (which is document order on the server and during hydration)
 * and *pinned to the asking component* via its `useId()`. A heading that
 * re-renders alone therefore keeps its id rather than claiming the next one.
 */
export class HeadingAnchorRegistry {
  private readonly idsByText = new Map<string, Array<string>>();
  private readonly nextByText = new Map<string, number>();
  private readonly claims = new Map<string, string>();

  constructor(outline: ReadonlyArray<HeadingOutlineEntry>) {
    for (const entry of outline) {
      const ids = this.idsByText.get(entry.text);
      if (ids) ids.push(entry.id);
      else this.idsByText.set(entry.text, [entry.id]);
    }
  }

  idFor(text: string, claimKey: string): string | undefined {
    const key = normalizeHeadingText(text);
    const ids = this.idsByText.get(key);
    if (!ids) return undefined;
    if (ids.length === 1) return ids[0];

    const claimed = this.claims.get(claimKey);
    if (claimed) return claimed;

    const next = this.nextByText.get(key) ?? 0;
    // More same-text headings rendered than the outline counted: give the
    // extras no id rather than a duplicate one.
    if (next >= ids.length) return undefined;
    this.nextByText.set(key, next + 1);
    const id = ids[next];
    this.claims.set(claimKey, id);
    return id;
  }
}

export const HeadingAnchorContext = createContext<HeadingAnchorRegistry | null>(
  null,
);

/**
 * The anchor id for a heading with this text, or `undefined` outside an
 * article (magazine spreads, colophons, previews) or when it isn't in the
 * outline. Pass `null` to opt a heading out while still calling the hook.
 */
export function useHeadingAnchorId(
  text: string | null | undefined,
): string | undefined {
  const registry = use(HeadingAnchorContext);
  const claimKey = useId();
  if (!registry || !text) return undefined;
  return registry.idFor(text, claimKey);
}
