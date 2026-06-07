import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: number;
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
  weight: number,
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
      loadLocalFont(
        "@fontsource/archivo",
        "archivo-latin-400-normal.woff",
        "Archivo",
        400,
        "normal",
      ),
    ]);
  }
  return ogFontsPromise;
}
