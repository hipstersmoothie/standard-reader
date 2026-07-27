import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { FontWeight } from "satori";

interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal" | "italic";
}

const require = createRequire(import.meta.url);

function fontsourceFile(pkg: string, filename: string): string {
  return join(
    dirname(require.resolve(`${pkg}/package.json`)),
    "files",
    filename,
  );
}

async function loadLocalFont(
  pkg: string,
  filename: string,
  name: string,
  weight: FontWeight,
  style: "normal" | "italic",
): Promise<LoadedFont> {
  const path = fontsourceFile(pkg, filename);
  const buffer = await readFile(path);
  return {
    name,
    data: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    weight,
    style,
  };
}

let ogFontsPromise: Promise<Array<LoadedFont>> | null = null;

/** Fonts used by quote OG cards (cached for the process lifetime). */
export function loadOgFonts(): Promise<Array<LoadedFont>> {
  if (!ogFontsPromise) {
    ogFontsPromise = Promise.all([
      loadLocalFont(
        "@fontsource/newsreader",
        "newsreader-latin-400-normal.woff",
        "Newsreader",
        400,
        "normal",
      ),
      loadLocalFont(
        "@fontsource/newsreader",
        "newsreader-latin-500-italic.woff",
        "Newsreader",
        500,
        "italic",
      ),
      loadLocalFont(
        "@fontsource/newsreader",
        "newsreader-latin-600-normal.woff",
        "Newsreader",
        600,
        "normal",
      ),
      // Static (non-variable) .woff files: satori's font parser supports
      // ttf/otf/woff but NOT woff2, so we can't feed it the variable woff2.
      loadLocalFont(
        "@fontsource/atkinson-hyperlegible-next",
        "atkinson-hyperlegible-next-latin-400-normal.woff",
        "Atkinson Hyperlegible Next",
        400,
        "normal",
      ),
      loadLocalFont(
        "@fontsource/atkinson-hyperlegible-next",
        "atkinson-hyperlegible-next-latin-700-normal.woff",
        "Atkinson Hyperlegible Next",
        700,
        "normal",
      ),
    ]);
  }
  return ogFontsPromise;
}
