"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "./docs-page.stylex";

export function DocsTopbar() {
  return (
    <header {...stylex.props(docsStyles.topbar)}>
      <div {...stylex.props(docsStyles.topbarLeft)}>
        <Link to="/" {...stylex.props(docsStyles.brandLink)}>
          Standard <span {...stylex.props(docsStyles.brandEm)}>Reader</span>
        </Link>
        <span {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagFull)}>
          <Trans>Developer docs</Trans>
        </span>
        <span
          {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagShort)}
        >
          <Trans>Docs</Trans>
        </span>
      </div>
    </header>
  );
}
