"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { LABELERS_DOCS_IDS } from "#/lib/labelers-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

const LINKS = [
  { id: LABELERS_DOCS_IDS.overview, label: msg`Overview` },
  { id: LABELERS_DOCS_IDS.running, label: msg`Running a labeler` },
  { id: LABELERS_DOCS_IDS.reference, label: msg`Reference implementation` },
] as const;

export function DocsLabelersNav() {
  const { i18n } = useLingui();
  const active = useDocsScrollSpyActive();

  return (
    <div {...stylex.props(docsStyles.refNavGroup)}>
      <div {...stylex.props(docsStyles.refNavHeadingRow)}>
        <span {...stylex.props(docsStyles.refNavHeading)}>
          <Trans>On this page</Trans>
        </span>
      </div>
      {LINKS.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === link.id && docsStyles.refNavLinkActive,
          )}
        >
          {i18n._(link.label)}
        </a>
      ))}
    </div>
  );
}
