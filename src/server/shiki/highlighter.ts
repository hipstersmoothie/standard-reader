import { codeBlockKey, normalizeLanguage } from "#/lib/code-highlight";
import type { ResolvedThemeScheme } from "#/lib/theme";
import type { LeafletCodeBlock } from "#/lib/leaflet/types";
import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from "shiki";

import {
  codeThemeNameForScheme,
  editorialCodeTheme,
  editorialCodeThemeDark,
} from "./editorial-theme";

const MAX_CACHE = 500;

const STARTER_LANGS = [
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "rust",
  "sql",
  "tsx",
  "typescript",
  "yaml",
] as const satisfies Array<BundledLanguage>;

const FALLBACK_LANG = "text";

let highlighterPromise: Promise<Highlighter> | null = null;
const htmlCache = new Map<string, string>();

async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    langs: [...STARTER_LANGS],
    themes: [editorialCodeTheme, editorialCodeThemeDark],
  });
  return highlighterPromise;
}

async function resolveLanguage(
  highlighter: Highlighter,
  language: string,
): Promise<string> {
  if (highlighter.getLoadedLanguages().includes(language)) {
    return language;
  }

  try {
    await highlighter.loadLanguage(language as BundledLanguage);
    return language;
  } catch {
    if (!highlighter.getLoadedLanguages().includes(FALLBACK_LANG)) {
      try {
        await highlighter.loadLanguage(FALLBACK_LANG as BundledLanguage);
      } catch {
        return "javascript";
      }
    }
    return FALLBACK_LANG;
  }
}

export async function highlightCodeBlock(
  plaintext: string,
  language: string | undefined,
  scheme: ResolvedThemeScheme = "light",
): Promise<string> {
  const themeName = codeThemeNameForScheme(scheme);
  const key = `${themeName}:${codeBlockKey({ language, plaintext })}`;
  const cached = htmlCache.get(key);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  const lang = await resolveLanguage(
    highlighter,
    normalizeLanguage(language),
  );
  const html = highlighter.codeToHtml(plaintext, {
    lang,
    theme: themeName,
  });

  if (htmlCache.size >= MAX_CACHE) {
    const oldest = htmlCache.keys().next().value;
    if (oldest) htmlCache.delete(oldest);
  }
  htmlCache.set(key, html);
  return html;
}

export async function highlightLeafletCodeBlocks(
  blocks: Array<LeafletCodeBlock>,
  scheme: ResolvedThemeScheme = "light",
): Promise<Record<string, string>> {
  const unique = new Map<string, LeafletCodeBlock>();
  for (const block of blocks) {
    if (!block.plaintext) continue;
    const key = codeBlockKey(block);
    unique.set(key, block);
  }

  if (unique.size === 0) return {};

  const entries = await Promise.all(
    [...unique.entries()].map(async ([key, block]) => {
      const html = await highlightCodeBlock(
        block.plaintext,
        block.language,
        scheme,
      );
      return [key, html] as const;
    }),
  );

  return Object.fromEntries(entries);
}
