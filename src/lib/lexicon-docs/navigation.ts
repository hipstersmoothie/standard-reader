import type { LexiconDocsEntry } from "./types";

import { LEXICON_DOCS_SECTIONS } from "./types";

export const LEXICON_DOCS_INTRO_IDS = {
  overview: "lex-overview",
  namespace: "lex-namespace",
} as const;

export function lexiconDocsEntryId(nsid: string): string {
  const leaf = nsid.split(".").pop() ?? nsid;
  return `lex-${leaf}`;
}

export function lexiconDocsSectionId(section: string): string {
  return `lex-section-${section.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
}

export function lexiconDocsNsidLeaf(nsid: string): string {
  return nsid.split(".").pop() ?? nsid;
}

export function lexiconDocsNsidPrefix(nsid: string): string {
  const leaf = lexiconDocsNsidLeaf(nsid);
  return nsid.slice(0, nsid.length - leaf.length);
}

export function lexiconDocsSectionCount(
  section: string,
  entries: Array<LexiconDocsEntry>,
): number {
  return entries.filter((entry) => entry.section === section).length;
}

function buildScrollSpyIds(entries: Array<LexiconDocsEntry>): Array<string> {
  return [
    LEXICON_DOCS_INTRO_IDS.overview,
    LEXICON_DOCS_INTRO_IDS.namespace,
    ...LEXICON_DOCS_SECTIONS.flatMap((section) => {
      const sectionEntries = entries.filter(
        (entry) => entry.section === section,
      );
      if (sectionEntries.length === 0) {
        return [];
      }
      return [
        lexiconDocsSectionId(section),
        ...sectionEntries.map((entry) => lexiconDocsEntryId(entry.id)),
      ];
    }),
  ];
}

export function lexiconDocsScrollSpyIds(
  entries: Array<LexiconDocsEntry>,
): Array<string> {
  return buildScrollSpyIds(entries);
}

export type LexiconDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function lexiconDocsJumpNavGroups(
  entries: Array<LexiconDocsEntry>,
): Array<LexiconDocsJumpNavGroup> {
  return [
    {
      label: "Getting started",
      options: [
        { id: LEXICON_DOCS_INTRO_IDS.overview, label: "Overview" },
        { id: LEXICON_DOCS_INTRO_IDS.namespace, label: "Namespace" },
      ],
    },
    ...LEXICON_DOCS_SECTIONS.flatMap((section) => {
      const sectionEntries = entries.filter(
        (entry) => entry.section === section,
      );
      if (sectionEntries.length === 0) {
        return [];
      }
      return [
        {
          label: section,
          options: [
            { id: lexiconDocsSectionId(section), label: section },
            ...sectionEntries.map((entry) => ({
              id: lexiconDocsEntryId(entry.id),
              label: lexiconDocsNsidLeaf(entry.id),
            })),
          ],
        },
      ];
    }),
  ];
}
