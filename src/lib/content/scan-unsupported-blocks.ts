import { leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_BLOCK, LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_BLOCK, OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks } from "#/lib/pckt/blocks";
import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";

const LEAFLET_SUPPORTED = new Set<string>(Object.values(LEAFLET_BLOCK));
const PCKT_SUPPORTED = new Set<string>(Object.values(PCKT_BLOCK));
const OFFPRINT_SUPPORTED = new Set<string>(Object.values(OFFPRINT_BLOCK));

/** Leaflet block types in the spec but not yet rendered in the reader. */
export const LEAFLET_KNOWN_UNSUPPORTED = [] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectBlockTypes(value: unknown, types: Set<string>): void {
  if (!isRecord(value)) return;

  if (typeof value.$type === "string") {
    types.add(value.$type);
  }

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        collectBlockTypes(entry, types);
      }
    } else if (isRecord(nested)) {
      collectBlockTypes(nested, types);
    }
  }
}

function unsupportedFromRenderable(
  contentFormat: string,
  contentJson: unknown,
): Set<string> {
  const unsupported = new Set<string>();

  if (contentFormat === LEAFLET_CONTENT) {
    for (const block of leafletBlocks(contentJson)) {
      if (block.kind === "unknown") unsupported.add(block.blockType);
    }
    return unsupported;
  }

  if (contentFormat === PCKT_CONTENT) {
    for (const block of pcktBlocks(contentJson)) {
      if (block.kind === "unknown") unsupported.add(block.blockType);
    }
    return unsupported;
  }

  if (contentFormat === OFFPRINT_CONTENT) {
    for (const block of offprintBlocks(contentJson)) {
      if (block.kind === "unknown") unsupported.add(block.blockType);
    }
    return unsupported;
  }

  return unsupported;
}

export interface UnsupportedBlockHit {
  blockType: string;
  contentFormat: string;
  count: number;
  sampleUris: Array<string>;
}

export interface UnsupportedBlockReport {
  byType: Array<UnsupportedBlockHit>;
  /** All distinct block $types found in raw JSON (including nested). */
  rawTypesByFormat: Record<string, Array<string>>;
  /** Types present in raw JSON but not in our supported constants. */
  gapsByFormat: Record<string, Array<string>>;
}

export function scanUnsupportedBlocks(
  documents: Array<{
    uri: string;
    contentFormat: string | null;
    contentJson: unknown;
  }>,
): UnsupportedBlockReport {
  const hits = new Map<
    string,
    { contentFormat: string; count: number; sampleUris: Array<string> }
  >();
  const rawTypesByFormat = new Map<string, Set<string>>();

  for (const doc of documents) {
    const format = doc.contentFormat;
    if (!format || !doc.contentJson) continue;

    const rawTypes = rawTypesByFormat.get(format) ?? new Set<string>();
    collectBlockTypes(doc.contentJson, rawTypes);
    rawTypesByFormat.set(format, rawTypes);

    for (const blockType of unsupportedFromRenderable(
      format,
      doc.contentJson,
    )) {
      const key = `${format}\0${blockType}`;
      const existing = hits.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.sampleUris.length < 3) {
          existing.sampleUris.push(doc.uri);
        }
      } else {
        hits.set(key, {
          contentFormat: format,
          count: 1,
          sampleUris: [doc.uri],
        });
      }
    }
  }

  const blockTypePrefix: Record<string, string> = {
    [LEAFLET_CONTENT]: "pub.leaflet.blocks.",
    [PCKT_CONTENT]: "blog.pckt.block.",
    [OFFPRINT_CONTENT]: "app.offprint.block.",
  };

  const gapsByFormat: Record<string, Array<string>> = {};
  for (const [format, types] of rawTypesByFormat) {
    const supported =
      format === LEAFLET_CONTENT
        ? LEAFLET_SUPPORTED
        : format === PCKT_CONTENT
          ? PCKT_SUPPORTED
          : format === OFFPRINT_CONTENT
            ? OFFPRINT_SUPPORTED
            : null;
    const prefix = blockTypePrefix[format];
    if (!supported || !prefix) continue;

    gapsByFormat[format] = [...types]
      .filter((type) => type.startsWith(prefix))
      .filter((type) => !supported.has(type))
      .toSorted();
  }

  const byType = [...hits.entries()]
    .map(([key, value]) => {
      const blockType = key.split("\0")[1] ?? key;
      return {
        blockType,
        contentFormat: value.contentFormat,
        count: value.count,
        sampleUris: value.sampleUris,
      };
    })
    .toSorted(
      (a, b) => b.count - a.count || a.blockType.localeCompare(b.blockType),
    );

  const rawTypesRecord: Record<string, Array<string>> = {};
  for (const [format, types] of rawTypesByFormat) {
    rawTypesRecord[format] = [...types].toSorted();
  }

  return { byType, rawTypesByFormat: rawTypesRecord, gapsByFormat };
}
