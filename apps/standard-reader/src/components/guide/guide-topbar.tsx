"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { ButtonLink } from "#/components/router-links";

import { docsStyles } from "../docs/docs-page.stylex";
import { BrandWordmark } from "../reader/brand-wordmark";
import { guideStyles } from "./guide-page.stylex";

/**
 * The guide's own header. Same shape as the developer docs' topbar, but it
 * says what these pages are — and points at the developer docs rather than
 * pretending to be them.
 *
 * Uses the app's own `BrandWordmark` rather than the docs topbar's local
 * italic variant: the guide sits one click from the app, so the two should
 * read as the same product.
 */
export function GuideTopbar() {
  return (
    <header {...stylex.props(docsStyles.topbar)}>
      <div {...stylex.props(docsStyles.topbarLeft)}>
        <Link to="/" {...stylex.props(guideStyles.brandLink)}>
          <BrandWordmark />
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
        <Link
          to="/docs/introduction"
          {...stylex.props(docsStyles.topbarNavLink)}
        >
          <Trans>Developer docs</Trans>
        </Link>
        {/* The one thing a reader here is most likely to want next. */}
        <ButtonLink to="/" variant="primary" size="sm">
          <Trans>Open the app</Trans>
        </ButtonLink>
      </nav>
    </header>
  );
}
