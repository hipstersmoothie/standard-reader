import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regenerate PWA / social icons from the Newsreader "S" glyph.
 *
 * Extracts the outline from the Newsreader variable font at the same instance
 * the favicon renders with in browsers (opsz 56, wght 500), centers its ink
 * bounding box in the canvas, and renders PNGs with resvg.
 *
 * Outputs:
 * - public/icon-320.{svg,png} — social / OG square
 * - public/icon-192.png, public/icon-512.png — manifest install icons
 * - public/apple-touch-icon.png — iOS home screen (180×180)
 * - extension/public/icons/icon-{16,32,48,128}.png — Chrome extension manifest
 * - extension/public/icon/{16,32,48,96,128}.png — legacy WXT icon paths
 *
 * Run: node scripts/generate-social-icon.mjs
 */
import { Resvg } from "@resvg/resvg-js";
import * as fontkit from "fontkit";

const BACKGROUND = "#fcfbf6"; // manifest background_color
const GLYPH_COLOR = "#c2502b"; // manifest theme_color == favicon oklch(0.575 0.155 38)
// Favicon is font-size 56 in a 64 viewBox; keep the same ink-height ratio.
const FAVICON_FONT_RATIO = 56 / 64;
const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(rootDir, "public");
const extensionIconsDir = join(rootDir, "extension/public/icons");
const extensionIconDir = join(rootDir, "extension/public/icon");

/** @type {Array<{ size: number; png: string; svg?: string; dir: string }>} */
const OUTPUTS = [
  { size: 320, png: "icon-320.png", svg: "icon-320.svg", dir: publicDir },
  { size: 512, png: "icon-512.png", dir: publicDir },
  { size: 192, png: "icon-192.png", dir: publicDir },
  { size: 180, png: "apple-touch-icon.png", dir: publicDir },
  { size: 128, png: "icon-128.png", dir: extensionIconsDir },
  { size: 48, png: "icon-48.png", dir: extensionIconsDir },
  { size: 32, png: "icon-32.png", dir: extensionIconsDir },
  { size: 16, png: "icon-16.png", dir: extensionIconsDir },
  { size: 128, png: "128.png", dir: extensionIconDir },
  { size: 96, png: "96.png", dir: extensionIconDir },
  { size: 48, png: "48.png", dir: extensionIconDir },
  { size: 32, png: "32.png", dir: extensionIconDir },
  { size: 16, png: "16.png", dir: extensionIconDir },
];

const fontDir = join(tmpdir(), "standard-reader-icon-font");
const fontPath = join(fontDir, "Newsreader-variable.ttf");

await mkdir(fontDir, { recursive: true });
try {
  await readFile(fontPath);
} catch {
  const response = await fetch(FONT_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Font download failed: ${response.status}`);
  }
  await writeFile(fontPath, Buffer.from(await response.arrayBuffer()));
}

const baseFont = fontkit.openSync(fontPath);
const glyphId = baseFont.glyphForCodePoint("S".codePointAt(0)).id;
// Browsers apply optical sizing from font-size: 56px -> opsz 56.
const instance = baseFont.getVariation({ opsz: 56, wght: 500 });
const glyph = instance.getGlyph(glyphId);
const bbox = glyph.bbox;

const inkWidth = bbox.maxX - bbox.minX;
const inkHeight = bbox.maxY - bbox.minY;

function buildSvg(size) {
  const inkRatio = (inkHeight / instance.unitsPerEm) * FAVICON_FONT_RATIO;
  const scale = (size * inkRatio) / inkHeight;
  const width = inkWidth * scale;
  const height = inkHeight * scale;
  const tx = (size - width) / 2 - bbox.minX * scale;
  const ty = (size - height) / 2 + bbox.maxY * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}" />
  <path transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)} ${-scale.toFixed(6)})" fill="${GLYPH_COLOR}" d="${glyph.path.toSVG()}" />
</svg>
`;
}

/** Full play glyph for the extension tray while read-aloud is active. */
function buildPlayingSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const playHeight = size * 0.46;
  const halfHeight = playHeight / 2;
  const playWidth = playHeight * 0.82;
  const left = cx - playWidth * 0.42;
  const right = cx + playWidth * 0.58;
  const top = cy - halfHeight;
  const bottom = cy + halfHeight;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}" />
  <polygon points="${left.toFixed(2)},${top.toFixed(2)} ${left.toFixed(2)},${bottom.toFixed(2)} ${right.toFixed(2)},${cy.toFixed(2)}" fill="${GLYPH_COLOR}" />
</svg>
`;
}

const extensionIconRoots = [extensionIconsDir, extensionIconDir];
function isExtensionIconOutput(dir) {
  return extensionIconRoots.some((root) => dir.startsWith(root));
}

for (const { size, png, svg, dir } of OUTPUTS) {
  await mkdir(dir, { recursive: true });
  const svgContent = buildSvg(size);
  const pngPath = join(dir, png);
  await writeFile(pngPath, new Resvg(svgContent).render().asPng());
  console.log(`Wrote ${pngPath}`);

  if (svg) {
    const svgPath = join(dir, svg);
    await writeFile(svgPath, svgContent);
    console.log(`Wrote ${svgPath}`);
  }

  if (!isExtensionIconOutput(dir)) continue;

  const playingPng = png.replace(/\.png$/, "-playing.png");
  const playingPath = join(dir, playingPng);
  await writeFile(
    playingPath,
    new Resvg(buildPlayingSvg(size)).render().asPng(),
  );
  console.log(`Wrote ${playingPath}`);
}
