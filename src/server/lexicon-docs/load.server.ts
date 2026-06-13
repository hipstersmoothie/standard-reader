import {
  parseLexiconDocument,
  sortLexiconDocsEntries,
} from "#/lib/lexicon-docs/parse";
import { isLexiconDocsListedEntry } from '#/lib/lexicon-docs/types';
import type { LexiconDocsPageData } from '#/lib/lexicon-docs/types';
import fs from "node:fs";
import path from "node:path";

const LEXICON_DIR = path.join(process.cwd(), "lexicons/app/standard-reader");

let cachedPageData: LexiconDocsPageData | null = null;

export function loadLexiconDocsPageData(): LexiconDocsPageData {
  if (cachedPageData) {
    return cachedPageData;
  }

  const files = fs
    .readdirSync(LEXICON_DIR)
    .filter((file) => file.endsWith(".json"))
    .toSorted();

  const entries = files
    .map((file) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(LEXICON_DIR, file), "utf8"),
      ) as unknown;
      return parseLexiconDocument(raw);
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .filter((entry) => isLexiconDocsListedEntry(entry));

  cachedPageData = { entries: sortLexiconDocsEntries(entries) };
  return cachedPageData;
}
