"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import type { DocsArea } from "./docs-nav-areas";
import { DOCS_AREAS } from "./docs-nav-areas";
import { docsStyles } from "./docs-page.stylex";

/**
 * The left docs sidebar: navigation between docs areas (API, Renderers,
 * Lexicons, Publishing). The current page's table of contents lives in the
 * right rail (see {@link DocsRefShell}), not here.
 */
export function DocsSideNav({ area }: { area: DocsArea }) {
  const { t, i18n } = useLingui();

  return (
    <nav {...stylex.props(docsStyles.refNav)} aria-label={t`Documentation`}>
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            <Trans>Documentation</Trans>
          </span>
        </div>
        {DOCS_AREAS.map((item) => (
          <Link
            key={item.area}
            to={item.to}
            {...stylex.props(
              docsStyles.refNavLink,
              item.area === area && docsStyles.refNavLinkActive,
            )}
          >
            {i18n._(item.label)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
