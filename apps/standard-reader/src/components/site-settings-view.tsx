"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import {
  ColorPicker,
  DefaultColorEditor,
} from "@standard-reader/design-system/color-picker";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { Switch } from "@standard-reader/design-system/switch";
import { TextField } from "@standard-reader/design-system/text-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, X } from "lucide-react";
import { useState } from "react";

import type { OwnedSite } from "#/integrations/tanstack-query/api-site.functions";
import { siteApi } from "#/integrations/tanstack-query/api-site.functions";
import type { SiteLink } from "#/lib/site/config";
import { SITE_MAX_LINKS } from "#/lib/site/config";
import { SITE_STYLE_COPY } from "#/lib/site/style-copy";
import type { SiteStyle } from "#/lib/site/styles";
import { SITE_STYLES } from "#/lib/site/styles";
import { authorSitePath, publicationSitePath } from "#/lib/site/url";

import { initials } from "./reader/format";
import { Masthead, ReaderContent } from "./reader/primitives";

/**
 * The colors a site's theme editor opens on when the owner has set none. Not
 * the app's palette: this is deliberately a *different* paper, so switching the
 * theme on is visibly a choice rather than a no-op the owner then has to
 * discover was applied.
 */
const THEME_DEFAULTS = {
  background: "#faf7f0",
  foreground: "#211d18",
  accent: "#8a3324",
  accentForeground: "#ffffff",
};

/**
 * "Your sites" — one card per site the signed-in account can customize: their
 * own, plus every publication in their repo.
 *
 * A site exists whether or not it has been configured, so every card links to a
 * live URL and the editor only ever changes how it looks. Nothing here can
 * create or destroy a page.
 */
export function SiteSettingsView() {
  const { t } = useLingui();
  const { data, isPending } = useQuery(siteApi.getOwnedSitesQueryOptions);
  const [editing, setEditing] = useState<OwnedSite | null>(null);

  return (
    <ReaderContent>
      <Masthead
        kicker={<Trans>Settings</Trans>}
        title={t`Your sites`}
        dek={t`A page for your work with none of Standard Reader's chrome — your name, your colors, your archive. Every publication you own has one, and so do you.`}
      />

      {isPending ? (
        <p {...stylex.props(styles.note)}>
          <Trans>Loading your sites…</Trans>
        </p>
      ) : data ? (
        <ul {...stylex.props(styles.list)}>
          {data.sites.map((site) => (
            <SiteCard
              key={site.publicationUri ?? "author"}
              site={site}
              did={data.did}
              onEdit={() => setEditing(site)}
            />
          ))}
        </ul>
      ) : (
        <p {...stylex.props(styles.note)}>
          <Trans>Sign in to customize your sites.</Trans>
        </p>
      )}

      <SiteEditorDialog
        site={editing}
        onClose={() => setEditing(null)}
        did={data?.did ?? null}
      />
    </ReaderContent>
  );
}

function SiteCard({
  site,
  did,
  onEdit,
}: {
  site: OwnedSite;
  did: string;
  onEdit: () => void;
}) {
  const { i18n } = useLingui();
  const href = site.rkey
    ? publicationSitePath(did, site.rkey)
    : authorSitePath(did);
  const styleName = i18n._(SITE_STYLE_COPY[site.config.style].name);

  return (
    <li {...stylex.props(styles.card)}>
      <Avatar
        size="md"
        src={site.iconUrl ?? undefined}
        fallback={initials(site.name)}
        alt={site.name}
      />
      <div {...stylex.props(styles.cardBody)}>
        <div {...stylex.props(styles.cardHead)}>
          <span {...stylex.props(styles.cardName)}>{site.name}</span>
          <Badge
            variant={site.publicationUri ? "default" : "primary"}
            size="sm"
          >
            {site.publicationUri ? (
              <Trans>Publication</Trans>
            ) : (
              <Trans>Everything you write</Trans>
            )}
          </Badge>
        </div>
        <span {...stylex.props(styles.cardMeta)}>
          {site.config.configured ? (
            <Trans>{styleName} · customized</Trans>
          ) : (
            <Trans>{styleName} · not customized yet</Trans>
          )}
        </span>
      </div>
      <Flex gap="lg" align="center" style={styles.cardActions}>
        {/* A plain anchor, not a router Link: a site is a page in its own
            right, and opening it in a new tab is what an owner checking their
            site actually wants. */}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          {...stylex.props(styles.viewLink)}
        >
          <Trans>View</Trans>
          <ExternalLink size={13} aria-hidden />
        </a>
        <Button variant="secondary" size="sm" onPress={onEdit}>
          <Trans>Customize</Trans>
        </Button>
      </Flex>
    </li>
  );
}

function SiteEditorDialog({
  site,
  did,
  onClose,
}: {
  site: OwnedSite | null;
  did: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={site != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.dialogTitle)}>
          <Trans>Customize site</Trans>
        </span>
      </DialogHeader>
      {site && did ? (
        // Keyed by subject so opening a second site starts from *its* saved
        // settings rather than the previous dialog's edited state.
        <SiteEditorForm
          key={site.publicationUri ?? "author"}
          site={site}
          did={did}
          close={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function SiteEditorForm({
  site,
  did,
  close,
}: {
  site: OwnedSite;
  did: string;
  close: () => void;
}) {
  const { t, i18n } = useLingui();
  const queryClient = useQueryClient();
  const config = site.config;

  const [style, setStyle] = useState<SiteStyle>(config.style);
  const [tagline, setTagline] = useState(config.tagline ?? "");
  const [links, setLinks] = useState<Array<SiteLink>>(config.links);
  const [showColophon, setShowColophon] = useState(
    config.showStandardReaderLink,
  );
  const [themeOn, setThemeOn] = useState(config.theme != null);
  const [background, setBackground] = useState(
    config.theme?.background ?? THEME_DEFAULTS.background,
  );
  const [foreground, setForeground] = useState(
    config.theme?.foreground ?? THEME_DEFAULTS.foreground,
  );
  const [accent, setAccent] = useState(
    config.theme?.accent ?? THEME_DEFAULTS.accent,
  );
  const [accentForeground, setAccentForeground] = useState(
    config.theme?.accentForeground ?? THEME_DEFAULTS.accentForeground,
  );

  const save = useMutation({
    ...siteApi.putSiteMutationOptions(),
    onSuccess: () => {
      toasts.add({ title: t`Site saved` });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
      close();
    },
    onError: (error: Error) => {
      toasts.add({
        title: t`Couldn’t save your site`,
        description: error.message,
      });
    },
  });

  const reset = useMutation({
    ...siteApi.deleteSiteMutationOptions(),
    onSuccess: () => {
      toasts.add({ title: t`Site reset to the default look` });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
      close();
    },
    onError: (error: Error) => {
      toasts.add({
        title: t`Couldn’t reset your site`,
        description: error.message,
      });
    },
  });

  const previewHref = `${
    site.rkey ? publicationSitePath(did, site.rkey) : authorSitePath(did)
  }?style=${style}`;

  const updateLink = (index: number, patch: Partial<SiteLink>) => {
    setLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );
  };

  return (
    <>
      <DialogBody>
        <Flex direction="column" gap="7xl">
          <section>
            <p {...stylex.props(styles.sectionHead)}>
              <Trans>Style</Trans>
            </p>
            <div {...stylex.props(styles.styleGrid)}>
              {SITE_STYLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={style === option}
                  onClick={() => setStyle(option)}
                  {...stylex.props(
                    styles.styleOption,
                    style === option && styles.styleOptionSelected,
                  )}
                >
                  <span {...stylex.props(styles.styleName)}>
                    {i18n._(SITE_STYLE_COPY[option].name)}
                  </span>
                  <span {...stylex.props(styles.styleDescription)}>
                    {i18n._(SITE_STYLE_COPY[option].description)}
                  </span>
                </button>
              ))}
            </div>
            <a
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              {...stylex.props(styles.previewLink)}
            >
              <Trans>Preview this style</Trans>
              <ExternalLink size={13} aria-hidden />
            </a>
          </section>

          <section>
            <TextField
              label={t`Tagline`}
              description={
                site.publicationUri
                  ? t`Shown under the name. Leave empty to use the publication’s description.`
                  : t`Shown under your name. Leave empty to use your bio.`
              }
              value={tagline}
              onChange={setTagline}
              maxLength={300}
            />
          </section>

          <section>
            <p {...stylex.props(styles.sectionHead)}>
              <Trans>Links</Trans>
            </p>
            <p {...stylex.props(styles.sectionNote)}>
              <Trans>
                Your other homes on the web, shown in the site’s masthead.
              </Trans>
            </p>
            <Flex direction="column" gap="2xl" style={styles.linkRows}>
              {links.map((link, index) => (
                <Flex
                  // Index-keyed on purpose: the rows are an ordered, editable
                  // list where the text *is* the value, so nothing else is
                  // stable while it is being typed.
                  key={index}
                  gap="lg"
                  align="end"
                  style={styles.linkRow}
                >
                  <TextField
                    label={t`Label`}
                    value={link.label}
                    onChange={(value) => updateLink(index, { label: value })}
                    style={styles.linkLabel}
                  />
                  <TextField
                    label={t`URL`}
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(value) => updateLink(index, { url: value })}
                    style={styles.linkUrl}
                  />
                  <Button
                    variant="tertiary"
                    size="sm"
                    aria-label={t`Remove link`}
                    onPress={() =>
                      setLinks((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <X size={14} aria-hidden />
                  </Button>
                </Flex>
              ))}
            </Flex>
            {links.length < SITE_MAX_LINKS ? (
              <Button
                variant="secondary"
                size="sm"
                style={styles.addLink}
                onPress={() =>
                  setLinks((prev) => [...prev, { label: "", url: "" }])
                }
              >
                <Plus size={14} aria-hidden />
                <Trans>Add link</Trans>
              </Button>
            ) : null}
          </section>

          <section>
            <p {...stylex.props(styles.sectionHead)}>
              <Trans>Colors</Trans>
            </p>
            <Switch isSelected={themeOn} onChange={setThemeOn}>
              {site.publicationUri ? (
                <Trans>
                  Use colors chosen here instead of the publication’s
                </Trans>
              ) : (
                <Trans>Give this site its own colors</Trans>
              )}
            </Switch>
            {themeOn ? (
              <Flex direction="column" gap="2xl" style={styles.colorRows}>
                <ColorPicker
                  label={t`Background`}
                  value={background}
                  onChange={(color) => setBackground(color.toString("hex"))}
                >
                  <DefaultColorEditor />
                </ColorPicker>
                <ColorPicker
                  label={t`Text`}
                  value={foreground}
                  onChange={(color) => setForeground(color.toString("hex"))}
                >
                  <DefaultColorEditor />
                </ColorPicker>
                <ColorPicker
                  label={t`Accent`}
                  value={accent}
                  onChange={(color) => setAccent(color.toString("hex"))}
                >
                  <DefaultColorEditor />
                </ColorPicker>
                <ColorPicker
                  label={t`Accent text`}
                  value={accentForeground}
                  onChange={(color) =>
                    setAccentForeground(color.toString("hex"))
                  }
                >
                  <DefaultColorEditor />
                </ColorPicker>
                <p {...stylex.props(styles.sectionNote)}>
                  <Trans>
                    A dark mode is generated from these, and any color that
                    would be unreadable on your page is nudged until it isn’t.
                  </Trans>
                </p>
              </Flex>
            ) : null}
          </section>

          <section>
            <Switch isSelected={showColophon} onChange={setShowColophon}>
              <Trans>Show a “Published with Standard Reader” line</Trans>
            </Switch>
          </section>
        </Flex>
      </DialogBody>
      <DialogFooter>
        {config.configured ? (
          <Button
            variant="tertiary"
            isDisabled={reset.isPending || save.isPending}
            onPress={() =>
              reset.mutate({ publicationUri: site.publicationUri })
            }
          >
            <Trans>Reset</Trans>
          </Button>
        ) : null}
        <Button variant="secondary" onPress={close}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          isDisabled={save.isPending || reset.isPending}
          onPress={() =>
            save.mutate({
              publicationUri: site.publicationUri,
              style,
              tagline: tagline.trim() || null,
              theme: themeOn
                ? { background, foreground, accent, accentForeground }
                : null,
              // Half-filled rows are dropped rather than rejected: the row is
              // how you add a link, so an empty one is a row you didn't finish,
              // not an error to argue with on save.
              links: links.filter(
                (link) => link.label.trim() && /^https?:\/\//i.test(link.url),
              ),
              showStandardReaderLink: showColophon,
            })
          }
        >
          <Trans>Save site</Trans>
        </Button>
      </DialogFooter>
    </>
  );
}

const MOBILE = "@media (max-width: 47.5rem)";

const styles = stylex.create({
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    paddingBottom: verticalSpace["5xl"],
    paddingTop: verticalSpace["5xl"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace["5xl"],
    paddingInlineStart: horizontalSpace.none,
    rowGap: gap["3xl"],
  },
  card: {
    alignItems: { default: "center", [MOBILE]: "flex-start" },
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: { default: "row", [MOBILE]: "column" },
    paddingBottom: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    rowGap: gap.lg,
  },
  cardBody: {
    flexGrow: 1,
    minWidth: 0,
  },
  cardHead: {
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
    marginTop: verticalSpace.xs,
  },
  cardActions: {
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
  dialogTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionHead: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.wide,
    marginBottom: verticalSpace.lg,
    marginTop: verticalSpace.none,
    textTransform: "uppercase",
  },
  sectionNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.lg,
    marginTop: verticalSpace.none,
  },
  styleGrid: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [MOBILE]: "1fr" },
    rowGap: gap["2xl"],
  },
  styleOption: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    backgroundColor: { default: "transparent", ":hover": uiColor.bgSubtle },
    paddingBottom: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingInlineStart: horizontalSpace["2xl"],
    paddingTop: verticalSpace["2xl"],
    rowGap: gap.xs,
    textAlign: "start",
  },
  styleOptionSelected: {
    borderColor: uiColor.text2,
    borderWidth: 2,
  },
  styleName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  styleDescription: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  previewLink: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xs,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginTop: verticalSpace["2xl"],
    textDecorationColor: "currentColor",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.25em",
  },
  linkRows: {
    marginBottom: verticalSpace.lg,
  },
  linkRow: {
    flexWrap: "wrap",
  },
  linkLabel: {
    flexBasis: "9rem",
    flexGrow: 1,
  },
  linkUrl: {
    flexBasis: "14rem",
    flexGrow: 2,
  },
  addLink: {
    alignSelf: "flex-start",
  },
  colorRows: {
    marginTop: verticalSpace["2xl"],
  },
});
