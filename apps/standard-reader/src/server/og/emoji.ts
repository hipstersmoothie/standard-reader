/**
 * Apple-emoji loader for Satori OG renderers. When Satori segments JSX text and finds an
 * emoji glyph it calls `loadAdditionalAsset(code, segment)` with `code === "emoji"`. The
 * bundled Inter font has no color emoji, so without this loader emoji come out as missing-
 * glyph rectangles ("tofu").
 *
 * We resolve each emoji to a 64×64 Apple-style PNG from `emoji-datasource-apple` on jsDelivr
 * and hand Satori back a `data:` URL (Satori 0.26 inlines the bytes during render — returning
 * a remote URL hits an internal `.trim()` on `undefined` because its fetch path assumes data
 * was preloaded).
 *
 * Shared across all `/api/og/*` routes so they render emoji identically.
 */

/**
 * Pinned major version of the `emoji-datasource-apple` npm package. Pinning protects us from
 * a future major reshuffling the asset path; bumping is a one-line change.
 */
const EMOJI_DATASOURCE_VERSION = "15";
const EMOJI_BASE_URL = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@${EMOJI_DATASOURCE_VERSION}/img/apple/64`;

/**
 * Convert an emoji segment to the hyphenated lowercase-hex codepoint sequence used by
 * `emoji-datasource-apple` PNG filenames. `for…of` over a string iterates by Unicode
 * codepoint (handling UTF-16 surrogate pairs), so e.g. `👨‍💻` -> `1f468-200d-1f4bb`.
 */
function emojiToAppleCodepoints(emoji: string): string {
  const codepoints: Array<string> = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    codepoints.push(cp.toString(16));
  }
  return codepoints.join("-");
}

/**
 * Cache resolved emoji `data:` URLs (and `null` for emojis we couldn't find) for the lifetime
 * of the worker. A single OG response can render the same emoji several times — without this
 * we'd refetch on every occurrence and on every subsequent OG request.
 */
const appleEmojiCache = new Map<string, string | null>();

async function fetchAppleEmojiPng(
  codepoints: string,
): Promise<string | undefined> {
  const response = await fetch(`${EMOJI_BASE_URL}/${codepoints}.png`);
  if (!response.ok) return undefined;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) return undefined;
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/**
 * Satori's `loadAdditionalAsset` hook. Pass directly into `satori()` options.
 */
export async function loadAppleEmojiAsset(
  code: string,
  segment: string,
): Promise<string | undefined> {
  if (code !== "emoji") return undefined;
  if (typeof segment !== "string" || segment.length === 0) return undefined;

  const codepoints = emojiToAppleCodepoints(segment);
  if (!codepoints) return undefined;

  const cached = appleEmojiCache.get(codepoints);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  try {
    let dataUrl = await fetchAppleEmojiPng(codepoints);

    /**
     * Text presentation variant (VS15 `FE0E`, e.g. after U+26FA tent) isn't how Apple PNGs
     * are keyed — assets use emoji presentation (`FE0F`) or omit the selector entirely.
     */
    if (!dataUrl && codepoints.includes("-fe0e")) {
      const fe0fSwapped = codepoints.replaceAll("-fe0e", "-fe0f");
      if (fe0fSwapped !== codepoints) {
        dataUrl = await fetchAppleEmojiPng(fe0fSwapped);
      }
      if (!dataUrl) {
        const strippedFe0e = codepoints
          .split("-")
          .filter((c) => c !== "fe0e")
          .join("-");
        if (strippedFe0e !== codepoints) {
          dataUrl = await fetchAppleEmojiPng(strippedFe0e);
        }
      }
    }

    /**
     * `emoji-datasource-apple` indexes most assets by their fully-qualified codepoints
     * (including `FE0F` variation selectors). A few legacy single-codepoint glyphs like
     * `2764` (heavy black heart) live at the unqualified path. If the qualified lookup
     * misses, retry with `FE0F` stripped so both presentations resolve.
     */
    if (!dataUrl && codepoints.includes("-fe0f")) {
      const stripped = codepoints
        .split("-")
        .filter((c) => c !== "fe0f")
        .join("-");
      if (stripped && stripped !== codepoints) {
        dataUrl = await fetchAppleEmojiPng(stripped);
      }
    }

    appleEmojiCache.set(codepoints, dataUrl ?? null);
    return dataUrl;
  } catch {
    appleEmojiCache.set(codepoints, null);
    return undefined;
  }
}
