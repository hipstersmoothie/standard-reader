"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../docs/docs-page.stylex";

/**
 * The guide's own header. Same shape as the developer docs' topbar, but it
 * says what these pages are — and points at the developer docs rather than
 * pretending to be them.
 */
export function GuideTopbar() {
  return (
    <header {...stylex.props(docsStyles.topbar)}>
      <div {...stylex.props(docsStyles.topbarLeft)}>
        <Link to="/" {...stylex.props(docsStyles.brandLink)}>
          Standard <span {...stylex.props(docsStyles.brandEm)}>Reader</span>
        </Link>
        <span {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagFull)}>
          <Trans>Reader guide</Trans>
        </span>
        <span
          {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagShort)}
        >
          <Trans>Guide</Trans>
        </span>
      </div>
      <nav {...stylex.props(docsStyles.topbarNav)}>
        <Link to="/" {...stylex.props(docsStyles.topbarNavLink)}>
          <Trans>Open the app</Trans>
        </Link>
        <Link
          to="/docs/introduction"
          {...stylex.props(docsStyles.topbarNavLink)}
        >
          <Trans>Developer docs</Trans>
        </Link>
      </nav>
    </header>
  );
}
