/**
 * `standard-reader formats` — print the capability matrix.
 *
 * Answers "what will I lose if I move to pckt?" before anyone signs in, which
 * is usually the question that comes first.
 */

import {
  BLOCK_SUPPORT,
  CONVERSION_TARGETS,
  FOOTNOTE_SUPPORT,
  TARGET_CONTENT_TYPE,
  TARGET_LABEL,
} from "@standard-reader/converter";
import type { BlockType, ConversionTarget } from "@standard-reader/converter";

import type { ParsedArgs } from "../args.js";
import { say, style } from "../output.js";

const SYMBOL: Record<string, string> = {
  degraded: "~",
  native: "✓",
  none: "✗",
};

/** Block types that only ever appear in one platform's own documents. */
function isPlatformBlock(blockType: string): boolean {
  return blockType.includes(".");
}

export function runFormats(args: ParsedArgs): number {
  if (args.flags.has("json")) {
    say(
      JSON.stringify(
        {
          blocks: BLOCK_SUPPORT,
          contentTypes: TARGET_CONTENT_TYPE,
          footnotes: FOOTNOTE_SUPPORT,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const targets = [...CONVERSION_TARGETS];
  const blockTypes = Object.keys(BLOCK_SUPPORT.leaflet) as Array<BlockType>;
  const common = blockTypes.filter((type) => !isPlatformBlock(type)).toSorted();
  const platform = blockTypes
    .filter((type) => isPlatformBlock(type))
    .toSorted();

  const width = Math.max(...blockTypes.map((type) => type.length)) + 2;
  const header = targets
    .map((entry) => TARGET_LABEL[entry].padEnd(10))
    .join("");

  say(style.bold(`${"block".padEnd(width)}${header}`));
  say(style.dim("─".repeat(width + targets.length * 10)));

  const row = (blockType: BlockType) => {
    const cells = targets
      .map((entry: ConversionTarget) => {
        const support = BLOCK_SUPPORT[entry][blockType];
        const symbol = SYMBOL[support.level] ?? "?";
        const colored =
          support.level === "native"
            ? style.green(symbol)
            : support.level === "degraded"
              ? style.yellow(symbol)
              : style.red(symbol);
        // Pad by the symbol's visible width, not the escape-coded string's.
        return colored + " ".repeat(10 - symbol.length);
      })
      .join("");
    say(`${blockType.padEnd(width)}${cells}`);
  };

  for (const blockType of common) row(blockType);
  say();
  say(style.dim("platform-specific blocks"));
  for (const blockType of platform) row(blockType);

  say();
  say(
    `${style.green("✓")} carried as-is   ${style.yellow("~")} converted with some loss   ${style.red("✗")} cannot be carried`,
  );
  say();
  say(style.bold("Footnotes"));
  for (const entry of targets) {
    say(`  ${TARGET_LABEL[entry].padEnd(10)}${FOOTNOTE_SUPPORT[entry]}`);
  }
  say();
  say(style.dim("Run `standard-reader formats --json` for the full notes."));
  return 0;
}
