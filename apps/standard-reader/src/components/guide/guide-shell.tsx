"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { GuideArea } from "#/lib/guide/navigation";
import { GUIDE_AREAS, guideSectionIds } from "#/lib/guide/navigation";

import { docsStyles } from "../docs/docs-page.stylex";
import { DocsScrollSpyProvider } from "../docs/docs-scroll-spy-context";
import { DocsToc } from "../docs/docs-toc";
import { GuideMobileNav } from "./guide-mobile-nav";
import { GuideOnThisPage } from "./guide-on-this-page";
import { guideStyles } from "./guide-page.stylex";
import { GuideSideNav } from "./guide-side-nav";

/**
 * Every guide page in one wrapper: masthead, both nav rails, the prose column,
 * a "still stuck?" footer, and links to the pages either side of this one.
 *
 * Pages pass their own `<h2 id={…}>` headings; the ids they use come from
 * `GUIDE_SECTIONS`, which is also what fills the rails.
 */
export function GuideShell({
  area,
  title,
  dek,
  children,
}: {
  area: GuideArea;
  title: ReactNode;
  dek: ReactNode;
  children: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const index = GUIDE_AREAS.findIndex((item) => item.area === area);
  const previous = index > 0 ? GUIDE_AREAS[index - 1] : undefined;
  const next =
    index !== -1 && index < GUIDE_AREAS.length - 1
      ? GUIDE_AREAS[index + 1]
      : undefined;

  return (
    <DocsScrollSpyProvider ids={guideSectionIds(area)}>
      <GuideMobileNav area={area} />
      <div {...stylex.props(docsStyles.refLayout)}>
        <GuideSideNav area={area} />
        <main {...stylex.props(docsStyles.refMain)}>
          {/* No kicker: the topbar and the sidebar heading already say where
              you are, and a third "Reader guide" above every h1 is noise. */}
          <div {...stylex.props(docsStyles.masthead)}>
            <h1 {...stylex.props(docsStyles.title)}>{title}</h1>
            <p {...stylex.props(docsStyles.dek)}>{dek}</p>
          </div>

          <div {...stylex.props(docsStyles.introProse)}>{children}</div>

          <div {...stylex.props(guideStyles.helpBox)}>
            <Trans>
              Still stuck, or something here doesn&apos;t match what you see?{" "}
              <Link to="/feedback" {...stylex.props(docsStyles.proseLink)}>
                Tell us on the feedback board
              </Link>{" "}
              — questions are welcome there, not just bug reports.
            </Trans>
          </div>

          <nav {...stylex.props(guideStyles.pageNav)} aria-label={t`Guide`}>
            {previous == null ? (
              <span />
            ) : (
              <Link to={previous.to} {...stylex.props(guideStyles.pageNavLink)}>
                <span {...stylex.props(guideStyles.pageNavLabel)}>
                  <Trans>Previous</Trans>
                </span>
                <span {...stylex.props(guideStyles.pageNavTitle)}>
                  {i18n._(previous.label)}
                </span>
              </Link>
            )}
            {next == null ? null : (
              <Link
                to={next.to}
                {...stylex.props(
                  guideStyles.pageNavLink,
                  guideStyles.pageNavLinkNext,
                )}
              >
                <span {...stylex.props(guideStyles.pageNavLabel)}>
                  <Trans>Next</Trans>
                </span>
                <span {...stylex.props(guideStyles.pageNavTitle)}>
                  {i18n._(next.label)}
                </span>
              </Link>
            )}
          </nav>
        </main>
        <DocsToc>
          <GuideOnThisPage area={area} />
        </DocsToc>
      </div>
    </DocsScrollSpyProvider>
  );
}
