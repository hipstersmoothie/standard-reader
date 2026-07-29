"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import type { GuideArea } from "#/lib/guide/navigation";
import { GUIDE_SECTIONS } from "#/lib/guide/navigation";

import { docsStyles } from "../docs/docs-page.stylex";
import { useDocsScrollSpyActive } from "../docs/docs-scroll-spy-context";

/**
 * The right rail's anchor list. Driven entirely by `GUIDE_SECTIONS`, so a page
 * can't drift out of sync with its own table of contents.
 */
export function GuideOnThisPage({ area }: { area: GuideArea }) {
  const { i18n } = useLingui();
  const active = useDocsScrollSpyActive();

  return (
    <div {...stylex.props(docsStyles.refNavGroup)}>
      <div {...stylex.props(docsStyles.refNavHeadingRow)}>
        <span {...stylex.props(docsStyles.refNavHeading)}>
          <Trans>On this page</Trans>
        </span>
      </div>
      {GUIDE_SECTIONS[area].map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === section.id && docsStyles.refNavLinkActive,
          )}
        >
          {i18n._(section.label)}
        </a>
      ))}
    </div>
  );
}
