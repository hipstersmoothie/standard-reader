import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import {
  authorSitePath,
  publicationSitePath,
} from "@standard-reader/site-config";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { common } from "../common-styles";
import { SiteEditor } from "../components/site-editor";
import { SITE_STYLE_COPY } from "../lib/site/style-copy";
import { getOwnedSites, putSite, resetSite } from "../server/site";
import type { OwnedSite } from "../server/site-write.server";

/** The editor's open/closed key for one site — its subject, in one place. */
function siteKey(site: OwnedSite): string {
  return site.publicationUri ?? "author";
}

export const Route = createFileRoute("/_app/sites")({
  loader: async () => ({ owned: await getOwnedSites() }),
  component: SitesScreen,
});

/**
 * "Your sites" — one card per site this account can customize: their own, plus
 * every publication they own.
 *
 * Every card links to a page that is already live. The editor only ever changes
 * how one looks, which is why there is no "create site" button anywhere on this
 * screen and no way to take one down.
 */
function SitesScreen() {
  const { owned } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!owned) {
    return (
      <div {...stylex.props(common.screen)}>
        <div
          {...stylex.props(
            common.container,
            common.measureNarrow,
            common.screenPadRoomy,
          )}
        >
          <p {...stylex.props(styles.note)}>Sign in to customize your sites.</p>
        </div>
      </div>
    );
  }

  const save = async (
    input: Parameters<typeof putSite>[0] extends { data: infer D } ? D : never,
  ) => {
    setSaving(true);
    setSaveError(null);
    try {
      await putSite({ data: input });
      setEditing(null);
      await router.invalidate();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn’t save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async (publicationUri: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      await resetSite({ data: { publicationUri } });
      setEditing(null);
      await router.invalidate();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn’t reset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.measureWide,
          common.screenPadRoomy,
        )}
      >
        <h1 {...stylex.props(styles.title)}>Your sites</h1>
        <p {...stylex.props(styles.intro)}>
          A page for your work with none of Standard Reader’s chrome — your
          name, your colors, your archive. Every publication you own has one,
          and so do you.
        </p>

        <ul {...stylex.props(styles.list)}>
          {owned.sites.map((site) => {
            const key = siteKey(site);
            const href = site.rkey
              ? publicationSitePath(owned.did, site.rkey)
              : authorSitePath(owned.did);
            const open = editing === key;
            return (
              <li key={key} {...stylex.props(styles.card)}>
                <div {...stylex.props(styles.cardHead)}>
                  <Avatar
                    size="md"
                    src={site.iconUrl ?? undefined}
                    fallback={site.name.trim()[0]?.toUpperCase() ?? "?"}
                    alt={site.name}
                  />
                  <div {...stylex.props(styles.cardBody)}>
                    <div {...stylex.props(styles.cardTitleRow)}>
                      <span {...stylex.props(styles.cardName)}>
                        {site.name}
                      </span>
                      <Badge
                        variant={site.publicationUri ? "default" : "primary"}
                        size="sm"
                      >
                        {site.publicationUri
                          ? "Publication"
                          : "Everything you write"}
                      </Badge>
                      {site.customDomain ? (
                        <Badge
                          variant={
                            site.customDomainVerified ? "success" : "warning"
                          }
                          size="sm"
                        >
                          {site.customDomain}
                        </Badge>
                      ) : null}
                    </div>
                    <span {...stylex.props(styles.cardMeta)}>
                      {SITE_STYLE_COPY[site.config.style].name}
                      {site.config.configured
                        ? " · customized"
                        : " · not customized yet"}
                    </span>
                  </div>
                  <div {...stylex.props(styles.cardActions)}>
                    {/* A site is a page in its own right, so checking it opens
                        a tab rather than navigating away from the editor. */}
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      {...stylex.props(styles.viewLink)}
                    >
                      View
                      <ExternalLink size={13} aria-hidden />
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => setEditing(open ? null : key)}
                    >
                      {open ? "Close" : "Customize"}
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div {...stylex.props(styles.editorSlot)}>
                    <SiteEditor
                      // Keyed by subject so opening a second site starts from
                      // *its* saved settings, not the last one's edits.
                      key={key}
                      site={site}
                      did={owned.did}
                      pro={owned.pro}
                      saving={saving}
                      error={saveError}
                      onSave={(input) => void save(input)}
                      onReset={() => void reset(site.publicationUri)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const styles = stylex.create({
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    marginBlockEnd: verticalSpace.lg,
    marginBlockStart: 0,
  },
  intro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: spacing["8"],
    marginBlockStart: 0,
    maxWidth: "620px",
  },
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    marginBlockEnd: 0,
    marginBlockStart: 0,
    paddingInlineStart: 0,
    rowGap: gap["3xl"],
  },
  card: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
  },
  cardHead: {
    alignItems: "center",
    columnGap: gap["3xl"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap.lg,
  },
  cardBody: {
    flexGrow: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap.xs,
  },
  cardName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardMeta: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginBlockStart: verticalSpace.xs,
  },
  cardActions: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexShrink: 0,
  },
  viewLink: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xs,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    textDecorationColor: { default: "transparent", ":hover": "currentColor" },
    textDecorationLine: "underline",
    textUnderlineOffset: "0.25em",
  },
  editorSlot: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBlockStart: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["4xl"],
  },
});
