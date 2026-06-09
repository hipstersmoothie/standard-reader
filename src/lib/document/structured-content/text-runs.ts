import type { StructuredText } from "./types";

import { utf8ByteLength } from "../../leaflet/utf8";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shift facet byte ranges forward by `byteOffset` (run concatenation). */
function offsetFacets(
  facets: Array<unknown> | undefined,
  byteOffset: number,
): Array<unknown> {
  if (!facets?.length) return [];
  if (byteOffset <= 0) return facets;
  return facets.flatMap((facet) => {
    if (!isRecord(facet) || !isRecord(facet.index)) return [];
    const { byteStart, byteEnd } = facet.index;
    if (typeof byteStart !== "number" || typeof byteEnd !== "number") {
      return [];
    }
    return [
      {
        ...facet,
        index: {
          ...facet.index,
          byteEnd: byteEnd + byteOffset,
          byteStart: byteStart + byteOffset,
        },
      },
    ];
  });
}

/**
 * Build a facet from a styled inline run (ProseMirror marks, BlockNote styles)
 * in the leaflet/AT Proto facet shape the shared faceted-text renderer
 * understands. `kinds` are suffix names (`bold`, `italic`, `code`, …);
 * `linkUri` adds a `#link` feature.
 */
export function syntheticFacet(
  byteStart: number,
  byteEnd: number,
  kinds: Array<string>,
  linkUri?: string,
): Record<string, unknown> | null {
  const features: Array<Record<string, unknown>> = kinds.map((kind) => ({
    $type: `site.standard.richtext.facet#${kind}`,
  }));
  if (linkUri) {
    features.push({
      $type: "site.standard.richtext.facet#link",
      uri: linkUri,
    });
  }
  if (features.length === 0 || byteEnd <= byteStart) return null;
  return { features, index: { byteEnd, byteStart } };
}

/**
 * Concatenate rich-text runs into a single `StructuredText`, shifting each
 * run's facet byte ranges to its position in the merged plaintext. Used by
 * formats that split one paragraph into multiple styled runs (logue list
 * items, ProseMirror/BlockNote inline content).
 */
export function mergeTextRuns(runs: Array<StructuredText>): StructuredText {
  let plaintext = "";
  const facets: Array<unknown> = [];
  for (const run of runs) {
    const byteOffset = utf8ByteLength(plaintext);
    facets.push(...offsetFacets(run.facets, byteOffset));
    plaintext += run.plaintext;
  }
  return facets.length > 0 ? { facets, plaintext } : { plaintext };
}
