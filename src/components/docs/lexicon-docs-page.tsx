"use client";

import * as stylex from "@stylexjs/stylex";
import { useLoaderData } from "@tanstack/react-router";
import {
  lexiconDocsScrollSpyIds,
  lexiconDocsSectionCount,
  lexiconDocsSectionId,
} from "#/lib/lexicon-docs/navigation";
import { LEXICON_DOCS_SECTIONS } from "#/lib/lexicon-docs/types";
import { useMemo } from "react";

import { DocsLexiconsMobileJumpNav } from "./docs-lexicons-mobile-jump-nav";
import { DocsLexiconsNav } from "./docs-lexicons-nav";
import { docsStyles } from "./docs-page.stylex";
import { DocsRefShell } from "./docs-ref-shell";
import { LexiconDocsEntrySection } from "./lexicon-docs-entry";
import { LexiconDocsIntro } from "./lexicon-docs-intro";

export function LexiconDocsPage() {
  const { entries } = useLoaderData({
    from: "/_docs-header-layout/docs/lexicons",
  });
  const scrollSpyIds = useMemo(
    () => lexiconDocsScrollSpyIds(entries),
    [entries],
  );

  return (
    <DocsRefShell
      scrollSpyIds={scrollSpyIds}
      nav={<DocsLexiconsNav entries={entries} />}
      mobileJumpNav={<DocsLexiconsMobileJumpNav entries={entries} />}
    >
      <LexiconDocsIntro />
      {LEXICON_DOCS_SECTIONS.map((section) => {
        const sectionEntries = entries.filter(
          (entry) => entry.section === section,
        );
        if (sectionEntries.length === 0) {
          return null;
        }
        const count = lexiconDocsSectionCount(section, entries);
        const subtitle =
          section === "Shared definitions" ? "defs" : "PDS records";

        return (
          <div key={section}>
            <div
              {...stylex.props(docsStyles.tierHead)}
              id={lexiconDocsSectionId(section)}
            >
              <h2 {...stylex.props(docsStyles.tierTitle)}>{section}</h2>
              <span {...stylex.props(docsStyles.tierSub)}>
                {subtitle} · {count} schema{count === 1 ? "" : "s"}
              </span>
            </div>
            {sectionEntries.map((entry, index) => (
              <LexiconDocsEntrySection
                key={entry.id}
                entry={entry}
                first={index === 0}
              />
            ))}
          </div>
        );
      })}
    </DocsRefShell>
  );
}
