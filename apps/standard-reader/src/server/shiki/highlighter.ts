import type { BundledLanguage, BundledTheme, Highlighter } from "shiki";
import { createHighlighter } from "shiki";

import { codeBlockKey, normalizeLanguage } from "#/lib/code-highlight";
import type { LeafletCodeBlock } from "#/lib/leaflet/types";
import type { ResolvedThemeScheme } from "#/lib/theme";

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

/**
 * Ensure a bundled theme is registered, returning the editorial theme's name if
 * it can't be loaded — a missing theme must never cost us the highlight.
 */
async function resolveTheme(
  highlighter: Highlighter,
  requested: string | undefined,
  scheme: ResolvedThemeScheme,
): Promise<string> {
  const fallback = codeThemeNameForScheme(scheme);
  if (!requested || requested === fallback) return fallback;
  if (highlighter.getLoadedThemes().includes(requested)) return requested;
  try {
    await highlighter.loadTheme(requested as BundledTheme);
    return requested;
  } catch {
    return fallback;
  }
}

export async function highlightCodeBlock(
  plaintext: string,
  language: string | undefined,
  scheme: ResolvedThemeScheme = "light",
  requestedTheme?: string,
): Promise<string> {
  const highlighterForTheme = await getHighlighter();
  const themeName = await resolveTheme(
    highlighterForTheme,
    requestedTheme,
    scheme,
  );
  const key = `${themeName}:${codeBlockKey({ language, plaintext })}`;
  const cached = htmlCache.get(key);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  const lang = await resolveLanguage(highlighter, normalizeLanguage(language));
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
  requestedTheme?: string,
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
        requestedTheme,
      );
      return [key, html] as const;
    }),
  );

  return Object.fromEntries(entries);
}
