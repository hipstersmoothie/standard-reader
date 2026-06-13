"use client";

import type { LexiconDocsEntry } from "#/lib/lexicon-docs/types";

import * as stylex from "@stylexjs/stylex";
import {
  LEXICON_DOCS_INTRO_IDS,
  lexiconDocsEntryId,
  lexiconDocsNsidLeaf,
  lexiconDocsSectionCount,
} from "#/lib/lexicon-docs/navigation";
import { LEXICON_DOCS_SECTIONS } from "#/lib/lexicon-docs/types";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

export function DocsLexiconsNav({
  entries,
}: {
  entries: Array<LexiconDocsEntry>;
}) {
  const active = useDocsScrollSpyActive();

  return (
    <nav {...stylex.props(docsStyles.refNav)} aria-label="Lexicon reference">
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            Getting started
          </span>
        </div>
        <a
          href={`#${LEXICON_DOCS_INTRO_IDS.overview}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === LEXICON_DOCS_INTRO_IDS.overview &&
              docsStyles.refNavLinkActive,
          )}
        >
          Overview
        </a>
        <a
          href={`#${LEXICON_DOCS_INTRO_IDS.namespace}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === LEXICON_DOCS_INTRO_IDS.namespace &&
              docsStyles.refNavLinkActive,
          )}
        >
          Namespace
        </a>
      </div>

      {LEXICON_DOCS_SECTIONS.map((section) => {
        const sectionEntries = entries.filter(
          (entry) => entry.section === section,
        );
        if (sectionEntries.length === 0) {
          return null;
        }
        const count = lexiconDocsSectionCount(section, entries);
        return (
          <div key={section} {...stylex.props(docsStyles.refNavGroup)}>
            <div {...stylex.props(docsStyles.refNavHeadingRow)}>
              <span {...stylex.props(docsStyles.refNavHeading)}>{section}</span>
              <span {...stylex.props(docsStyles.refNavHeadingCount)}>
                {count}
              </span>
            </div>
            {sectionEntries.map((entry) => {
              const id = lexiconDocsEntryId(entry.id);
              return (
                <a
                  key={entry.id}
                  href={`#${id}`}
                  {...stylex.props(
                    docsStyles.refNavLink,
                    docsStyles.refNavLinkMono,
                    active === id && docsStyles.refNavLinkActive,
                  )}
                >
                  {lexiconDocsNsidLeaf(entry.id)}
                </a>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
