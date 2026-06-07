import { structuredPlaintextFromBlocks } from "#/lib/document/structured-content/plaintext";

import { offprintBlocks } from "./blocks";

/** Flatten offprint content to a single plaintext string. */
export function offprintPlaintext(content: unknown): string | null {
  return structuredPlaintextFromBlocks(offprintBlocks(content));
}
