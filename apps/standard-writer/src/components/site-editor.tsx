import { Alert } from "@standard-reader/design-system/alert";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import {
  ColorPicker,
  DefaultColorEditor,
} from "@standard-reader/design-system/color-picker";
import { Switch } from "@standard-reader/design-system/switch";
import { TextField } from "@standard-reader/design-system/text-field";
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
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import type { SiteLink, SiteStyle } from "@standard-reader/site-config";
import {
  SITE_MAX_LINKS,
  SITE_STYLES,
  authorSitePath,
  publicationSitePath,
} from "@standard-reader/site-config";
import * as stylex from "@stylexjs/stylex";
import { ExternalLink, Plus, X } from "lucide-react";
import { useState } from "react";

import { SITE_STYLE_COPY } from "../lib/site/style-copy";
import type { OwnedSite } from "../server/site-write.server";

/**
 * The colors the theme editor opens on when the owner has set none. Not the
 * app's palette: a different paper, so switching colors on is visibly a choice
 * rather than a no-op the owner has to go looking for.
 */
const THEME_DEFAULTS = {
  background: "#faf7f0",
  foreground: "#211d18",
  accent: "#8a3324",
  accentForeground: "#ffffff",
};

export interface SiteEditorProps {
  site: OwnedSite;
  did: string;
  /** Whether this account has Standard Writer Pro — gates the custom domain. */
  pro: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: {
    publicationUri: string | null;
    style: SiteStyle;
    tagline: string | null;
    theme: {
      background: string | null;
      foreground: string | null;
      accent: string | null;
      accentForeground: string | null;
    } | null;
    links: Array<SiteLink>;
    showStandardReaderLink: boolean;
    customDomain: string | null;
  }) => void;
  onReset: () => void;
}

/**
 * One site's presentation, edited.
 *
 * Everything here is the *look* of a page that already exists — there is no
 * create and no delete, because every publication and every account has a site
 * whether or not anyone has touched this screen. "Reset" removes the
 * customization, not the page.
 */
export function SiteEditor({
  site,
  did,
  pro,
  saving,
  error,
  onSave,
  onReset,
}: SiteEditorProps) {
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
  const [customDomain, setCustomDomain] = useState(site.customDomain ?? "");

  const path = site.rkey
    ? publicationSitePath(did, site.rkey)
    : authorSitePath(did);

  const updateLink = (index: number, patch: Partial<SiteLink>) => {
    setLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );
  };

  return (
    <div {...stylex.props(styles.editor)}>
      {error ? <Alert variant="critical">{error}</Alert> : null}

      <section>
        <p {...stylex.props(styles.sectionHead)}>Style</p>
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
                {SITE_STYLE_COPY[option].name}
              </span>
              <span {...stylex.props(styles.styleDescription)}>
                {SITE_STYLE_COPY[option].description}
              </span>
            </button>
          ))}
        </div>
        <a
          href={`${path}?style=${style}`}
          target="_blank"
          rel="noreferrer"
          {...stylex.props(styles.previewLink)}
        >
          Preview this style
          <ExternalLink size={13} aria-hidden />
        </a>
      </section>

      <section>
        <TextField
          label="Tagline"
          description={
            site.publicationUri
              ? "Shown under the name. Leave empty to use the publication's description."
              : "Shown under your name. Leave empty to use your bio."
          }
          value={tagline}
          onChange={setTagline}
          maxLength={300}
        />
      </section>

      <section>
        <p {...stylex.props(styles.sectionHead)}>Links</p>
        <p {...stylex.props(styles.sectionNote)}>
          Your other homes on the web, shown in the site’s masthead.
        </p>
        <div {...stylex.props(styles.linkRows)}>
          {links.map((link, index) => (
            <div
              // Index-keyed on purpose: an ordered, editable list where the
              // text *is* the value, so nothing else is stable while typing.
              key={index}
              {...stylex.props(styles.linkRow)}
            >
              <TextField
                label="Label"
                value={link.label}
                onChange={(value) => updateLink(index, { label: value })}
                style={styles.linkLabel}
              />
              <TextField
                label="URL"
                type="url"
                placeholder="https://"
                value={link.url}
                onChange={(value) => updateLink(index, { url: value })}
                style={styles.linkUrl}
              />
              <Button
                variant="tertiary"
                size="sm"
                aria-label="Remove link"
                onPress={() =>
                  setLinks((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <X size={14} aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        {links.length < SITE_MAX_LINKS ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              setLinks((prev) => [...prev, { label: "", url: "" }])
            }
          >
            <Plus size={14} aria-hidden />
            Add link
          </Button>
        ) : null}
      </section>

      <section>
        <p {...stylex.props(styles.sectionHead)}>Colors</p>
        <Switch isSelected={themeOn} onChange={setThemeOn}>
          {site.publicationUri
            ? "Use colors chosen here instead of the publication’s"
            : "Give this site its own colors"}
        </Switch>
        {themeOn ? (
          <div {...stylex.props(styles.colorRows)}>
            <ColorPicker
              label="Background"
              value={background}
              onChange={(color) => setBackground(color.toString("hex"))}
            >
              <DefaultColorEditor />
            </ColorPicker>
            <ColorPicker
              label="Text"
              value={foreground}
              onChange={(color) => setForeground(color.toString("hex"))}
            >
              <DefaultColorEditor />
            </ColorPicker>
            <ColorPicker
              label="Accent"
              value={accent}
              onChange={(color) => setAccent(color.toString("hex"))}
            >
              <DefaultColorEditor />
            </ColorPicker>
            <ColorPicker
              label="Accent text"
              value={accentForeground}
              onChange={(color) => setAccentForeground(color.toString("hex"))}
            >
              <DefaultColorEditor />
            </ColorPicker>
            <p {...stylex.props(styles.sectionNote)}>
              A dark mode is generated from these, and any color that would be
              unreadable on your page is nudged until it isn’t.
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <div {...stylex.props(styles.proHead)}>
          <p {...stylex.props(styles.sectionHead)}>Custom domain</p>
          <Badge variant={pro ? "primary" : "default"} size="sm">
            {pro ? "Pro" : "Pro only"}
          </Badge>
        </div>
        {pro ? (
          <>
            <TextField
              label="Domain"
              description="Point a CNAME at sites.standard-reader.app, then enter the hostname here. The site keeps working at its Writer address either way."
              placeholder="writing.example.com"
              value={customDomain}
              onChange={setCustomDomain}
            />
            {site.customDomain ? (
              <p {...stylex.props(styles.sectionNote)}>
                {site.customDomainVerified
                  ? `Serving from ${site.customDomain}.`
                  : `${site.customDomain} isn’t verified yet — the site stays at its Writer address until the DNS points here.`}
              </p>
            ) : null}
          </>
        ) : (
          <p {...stylex.props(styles.sectionNote)}>
            Standard Writer Pro lets a site live on a domain you own, so readers
            never see our address. Everything else on this screen is free.
          </p>
        )}
      </section>

      <section>
        <Switch isSelected={showColophon} onChange={setShowColophon}>
          Show a “Published with Standard Reader” line
        </Switch>
      </section>

      <div {...stylex.props(styles.actions)}>
        {config.configured ? (
          <Button variant="tertiary" isDisabled={saving} onPress={onReset}>
            Reset
          </Button>
        ) : null}
        <Button
          variant="primary"
          isDisabled={saving}
          onPress={() =>
            onSave({
              publicationUri: site.publicationUri,
              style,
              tagline: tagline.trim() || null,
              theme: themeOn
                ? { background, foreground, accent, accentForeground }
                : null,
              // Half-filled rows are dropped rather than rejected: a row is how
              // you add a link, so an empty one is a row you did not finish,
              // not an error to argue with on save.
              links: links.filter(
                (link) => link.label.trim() && /^https?:\/\//i.test(link.url),
              ),
              showStandardReaderLink: showColophon,
              customDomain: pro ? customDomain.trim() || null : null,
            })
          }
        >
          {saving ? "Saving…" : "Save site"}
        </Button>
      </div>
    </div>
  );
}

const MOBILE = "@media (max-width: 47.5rem)";

const styles = stylex.create({
  editor: {
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["10"],
  },
  sectionHead: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.wide,
    marginBlockEnd: verticalSpace.lg,
    marginBlockStart: 0,
    textTransform: "uppercase",
  },
  sectionNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBlockEnd: verticalSpace.lg,
    marginBlockStart: verticalSpace.lg,
  },
  proHead: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
  },
  styleGrid: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [MOBILE]: "1fr" },
    rowGap: gap["2xl"],
  },
  styleOption: {
    backgroundColor: { default: "transparent", ":hover": uiColor.bgSubtle },
    borderColor: { default: uiColor.border1, ":hover": uiColor.border2 },
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    paddingBlockEnd: verticalSpace["2xl"],
    paddingBlockStart: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingInlineStart: horizontalSpace["2xl"],
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
    marginBlockStart: verticalSpace["2xl"],
    textDecorationColor: "currentColor",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.25em",
  },
  linkRows: {
    display: "flex",
    flexDirection: "column",
    marginBlockEnd: verticalSpace.lg,
    rowGap: gap["2xl"],
  },
  linkRow: {
    alignItems: "end",
    columnGap: gap.lg,
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap.lg,
  },
  linkLabel: {
    flexBasis: "9rem",
    flexGrow: 1,
  },
  linkUrl: {
    flexBasis: "14rem",
    flexGrow: 2,
  },
  colorRows: {
    display: "flex",
    flexDirection: "column",
    marginBlockStart: verticalSpace["2xl"],
    rowGap: gap["2xl"],
  },
  actions: {
    columnGap: gap.lg,
    display: "flex",
    justifyContent: "flex-end",
  },
});
