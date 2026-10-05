/**
 * Witchsky themes as Standard Reader palettes.
 *
 * Witchsky (a Bluesky client) stores themes in the reader's own repo:
 * `app.witchsky.theme.colors` for themes they made and
 * `app.witchsky.theme.saved` for themes they saved from someone else, which
 * carries a full `snapshot` of the theme so it renders without a second fetch.
 * Lexicons are published under the `witchsky.app` authority.
 *
 * A Witchsky theme states thirteen semantic colors; our custom palette takes
 * two and derives the rest. `canvas` is the page and `accent` is the accent, so
 * importing a theme is just filling the custom palette's paper + accent.
 *
 * Fetched in the browser, straight from the reader's PDS: this is a third-party
 * collection we only read on the settings page, so it gets no DB mirror (see the
 * "AT Protocol data model" rules in CLAUDE.md).
 */

export const WITCHSKY_THEME_COLLECTION = "app.witchsky.theme.colors";
export const WITCHSKY_SAVED_THEME_COLLECTION = "app.witchsky.theme.saved";

/** Microcosm's identity cache — resolves a DID to its PDS with open CORS. */
const SLINGSHOT_URL = "https://slingshot.microcosm.blue";
const FETCH_TIMEOUT_MS = 8000;
const LIST_LIMIT = 100;

/**
 * Material You themes are generated from the device's system palette; the
 * colors stored on the record are only an example of what that might produce,
 * so applied verbatim they'd be a black page with an arbitrary accent. The
 * lexicon lets clients without generator support hide them.
 */
const GENERATED_THEME_TYPE = "app.witchsky.theme.defs#materialYou";

/** Witchsky's name for a theme's unvaried color set. */
const BASE_VARIANT_NAME = "Default";

/** One selectable palette: a theme's base colors, or one of its variants. */
export interface WitchskyPalette {
  /** `<theme at-uri>#<variant index>`; `base` for the theme's own colors. */
  id: string;
  /** Theme name, plus the variant's when it is one — "Coffee · Light". */
  name: string;
  paper: string;
  accent: string;
}

interface ThemeColors {
  canvas?: unknown;
  accent?: unknown;
}

interface ThemeRecord {
  name?: unknown;
  special?: { $type?: unknown };
  base?: { name?: unknown; colors?: ThemeColors };
  variants?: Array<{ name?: unknown; colors?: ThemeColors }>;
}

interface ListedRecord {
  uri: string;
  value: unknown;
}

const HEX_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

/**
 * Lowercase `#rrggbb`, or `null` for anything else. The custom palette stores a
 * hex pair, and a theme record is someone else's data: an alpha channel or a
 * named color would round-trip into the cookie and the color pickers badly.
 */
function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string" || !HEX_PATTERN.test(value)) return null;
  const hex = value.slice(1).toLowerCase();
  if (hex.length === 3) {
    return `#${[...hex].map((digit) => digit + digit).join("")}`;
  }
  return `#${hex.slice(0, 6)}`;
}

function themeName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Every palette one theme record offers — base first, then its variants. */
export function palettesFromTheme(
  uri: string,
  record: unknown,
): Array<WitchskyPalette> {
  if (!record || typeof record !== "object") return [];
  const theme = record as ThemeRecord;
  if (theme.special?.$type === GENERATED_THEME_TYPE) return [];
  const name = themeName(theme.name);
  const basePaper = normalizeHex(theme.base?.colors?.canvas);
  const baseAccent = normalizeHex(theme.base?.colors?.accent);
  if (!name || !basePaper || !baseAccent) return [];

  const palettes: Array<WitchskyPalette> = [];
  const baseName = themeName(theme.base?.name);
  palettes.push({
    id: `${uri}#base`,
    name:
      baseName && baseName !== BASE_VARIANT_NAME && baseName !== name
        ? `${name} · ${baseName}`
        : name,
    paper: basePaper,
    accent: baseAccent,
  });

  // A variant only overrides what it states; the rest falls through to base.
  for (const [index, variant] of (Array.isArray(theme.variants)
    ? theme.variants
    : []
  ).entries()) {
    const variantName = themeName(variant?.name);
    if (!variantName) continue;
    palettes.push({
      id: `${uri}#${index}`,
      name: `${name} · ${variantName}`,
      paper: normalizeHex(variant.colors?.canvas) ?? basePaper,
      accent: normalizeHex(variant.colors?.accent) ?? baseAccent,
    });
  }

  return palettes;
}

/**
 * The reader's own themes, then the ones they saved, with duplicates dropped:
 * saving your own theme is common (Witchsky's gallery offers it), and the same
 * colors listed twice reads as a bug. A saved theme is keyed on the theme it
 * points at, so a later edit to the original still collapses onto it.
 */
export function palettesFromRecords(
  themes: ReadonlyArray<ListedRecord>,
  saved: ReadonlyArray<ListedRecord>,
): Array<WitchskyPalette> {
  const seenThemes = new Set<string>();
  const seenColors = new Set<string>();
  const palettes: Array<WitchskyPalette> = [];

  const add = (uri: string, record: unknown) => {
    if (seenThemes.has(uri)) return;
    seenThemes.add(uri);
    for (const palette of palettesFromTheme(uri, record)) {
      const key = `${palette.paper}${palette.accent}`;
      if (seenColors.has(key)) continue;
      seenColors.add(key);
      palettes.push(palette);
    }
  };

  for (const theme of themes) add(theme.uri, theme.value);
  for (const item of saved) {
    const value = item.value as
      | { subject?: { uri?: unknown }; snapshot?: unknown }
      | undefined;
    const subject =
      typeof value?.subject?.uri === "string" ? value.subject.uri : item.uri;
    add(subject, value?.snapshot);
  }

  return palettes;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function resolvePds(did: string): Promise<string> {
  const doc = (await getJson(
    `${SLINGSHOT_URL}/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${encodeURIComponent(did)}`,
  )) as { pds?: unknown };
  if (typeof doc.pds !== "string") throw new Error(`No PDS for ${did}`);
  return doc.pds;
}

async function listRecords(
  pds: string,
  did: string,
  collection: string,
): Promise<Array<ListedRecord>> {
  const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  url.searchParams.set("limit", String(LIST_LIMIT));
  const page = (await getJson(url.toString())) as { records?: unknown };
  return Array.isArray(page.records)
    ? (page.records as Array<ListedRecord>)
    : [];
}

/** The Witchsky palettes in a reader's repo — empty when they have none. */
export async function fetchWitchskyPalettes(
  did: string,
): Promise<Array<WitchskyPalette>> {
  const pds = await resolvePds(did);
  const [themes, saved] = await Promise.all([
    listRecords(pds, did, WITCHSKY_THEME_COLLECTION),
    listRecords(pds, did, WITCHSKY_SAVED_THEME_COLLECTION),
  ]);
  return palettesFromRecords(themes, saved);
}
