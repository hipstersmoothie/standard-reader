"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import type { GuideArea } from "#/lib/guide/navigation";
import { GUIDE_AREAS } from "#/lib/guide/navigation";

import { docsStyles } from "../docs/docs-page.stylex";

/** The guide's left sidebar: one link per page, in reading order. */
export function GuideSideNav({ area }: { area: GuideArea }) {
  const { t, i18n } = useLingui();

  return (
    <nav {...stylex.props(docsStyles.refNav)} aria-label={t`Reader guide`}>
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            <Trans>Reader guide</Trans>
          </span>
        </div>
        {GUIDE_AREAS.map((item) => (
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
