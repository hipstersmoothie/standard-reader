"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

import type { CollectionsTheme } from "#/integrations/tanstack-query/api-collections.functions";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { contrastRatio } from "#/lib/collections/color";
import {
  buildMagazinePalette,
  themePrefersDark,
} from "#/lib/collections/radix-theme";
import type { CollectionTheme } from "#/lib/collections/theme";
import { googleFontsHref } from "#/magazine/theme-vars";

import { Button } from "../../design-system/button";
import {
  ColorPicker,
  DefaultColorEditor,
} from "../../design-system/color-picker";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "../../design-system/dialog";
import { Flex } from "../../design-system/flex";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../design-system/segmented-control";
import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  fontFamily,
  fontSize,
} from "../../design-system/theme/typography.stylex";
import { SmallBody } from "../../design-system/typography";
import { ReadingCustomFontPicker } from "../reading-custom-font-picker";

const DEFAULTS = {
  background: "#fbfaf7",
  foreground: "#1d1a17",
  accent: "#c0502f",
  accentForeground: "#ffffff",
};

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: 600,
  },
  columns: { alignItems: "flex-start", flexWrap: "wrap" },
  controls: { flexBasis: "16rem", flexGrow: 1, minWidth: "14rem" },
  previewCol: { flexBasis: "18rem", flexGrow: 1, minWidth: "15rem" },
  sectionHead: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  checkOk: { color: uiColor.text1 },
  checkWarn: { color: "#b4690e" },
  // Preview surface — the magazine palette vars are applied inline; sample
  // elements reference them so it reads like a tiny magazine cover. The card
  // sits on a neutral stage with a border + shadow so a light (near-white) paper
  // is still clearly visible against the dialog.
  preview: {
    padding: "1.25rem",
    borderRadius: radius.md,
    backgroundColor: uiColor.component2,
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(128,128,128,0.10) 0, rgba(128,128,128,0.10) 1px, transparent 1px, transparent 9px)",
  },
  // Dark scheme preview: darken the stage so the dark card reads naturally.
  previewStageDark: { backgroundColor: "#1b1b1f" },
  previewInner: {
    padding: "1.25rem",
    borderColor: "color-mix(in oklab, var(--ink) 18%, transparent)",
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "var(--paper)",
    boxShadow: "0 6px 20px -8px rgba(0,0,0,0.35)",
    color: "var(--ink)",
  },
  previewKicker: {
    color: "var(--accent-ink)",
    fontFamily: "var(--prev-body, sans-serif)",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  previewRule: {
    borderRadius: "2px",
    backgroundColor: "var(--accent)",
    height: "3px",
    marginBottom: "0.75rem",
    marginInlineStart: "0",
    marginInlineEnd: "0",
    marginTop: "0.6rem",
    width: "3.5rem",
  },
  previewTitle: {
    margin: 0,
    color: "var(--ink)",
    fontFamily: "var(--prev-title, var(--prev-body, serif))",
    fontSize: "1.7rem",
    fontStyle: "italic",
    lineHeight: 1.05,
  },
  previewBody: {
    color: "var(--ink-soft)",
    fontFamily: "var(--prev-body, serif)",
    fontSize: "0.8rem",
    lineHeight: 1.5,
    marginBottom: "0",
    marginInlineStart: "0",
    marginInlineEnd: "0",
    marginTop: "0.75rem",
  },
  previewTocRow: {
    alignItems: "baseline",
    columnGap: "0.6rem",
    display: "flex",
    rowGap: "0.6rem",
    borderTopColor: "var(--line)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "1rem",
    paddingTop: "0.5rem",
  },
  previewTocN: {
    color: "var(--accent-ink)",
    fontFamily: "var(--prev-body, monospace)",
    fontSize: "0.65rem",
    fontWeight: 700,
  },
  previewTocT: {
    color: "var(--ink)",
    flexGrow: 1,
    fontFamily: "var(--prev-title, var(--prev-body, serif))",
    fontSize: "0.85rem",
  },
  previewTocP: {
    color: "var(--muted)",
    fontFamily: "var(--prev-body, sans-serif)",
    fontSize: "0.55rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  previewAccentPill: {
    borderRadius: radius.full,
    backgroundColor: "var(--accent)",
    color: "var(--accent-contrast)",
    display: "inline-block",
    fontFamily: "var(--prev-body, sans-serif)",
    fontSize: "0.7rem",
    fontWeight: 600,
    marginTop: "0.85rem",
    paddingBottom: "0.3rem",
    paddingInlineStart: "0.7rem",
    paddingInlineEnd: "0.7rem",
    paddingTop: "0.3rem",
  },
  // Dynamic palette vars applied via stylex (no inline style → no bad merge).
  paletteVars: (
    paper: string,
    ink: string,
    inkSoft: string,
    muted: string,
    line: string,
    accent: string,
    accentInk: string,
    accentContrast: string,
    titleFont: string | null,
    bodyFont: string | null,
  ) => ({
    "--accent": accent,
    "--accent-contrast": accentContrast,
    "--accent-ink": accentInk,
    "--ink": ink,
    "--ink-soft": inkSoft,
    "--line": line,
    "--muted": muted,
    "--paper": paper,
    "--prev-body": bodyFont,
    "--prev-title": titleFont,
  }),
});

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <ColorPicker
      label={label}
      value={value}
      onChange={(color) => onChange(color.toString("hex"))}
    >
      <DefaultColorEditor />
    </ColorPicker>
  );
}

function ContrastCheck({
  label,
  ratio,
  min,
}: {
  label: string;
  ratio: number;
  min: number;
}) {
  const { t } = useLingui();
  const ok = ratio >= min;
  const needsNote = t`(needs ${min}:1)`;
  return (
    <Flex
      align="center"
      gap="sm"
      style={ok ? styles.checkOk : styles.checkWarn}
    >
      {ok ? (
        <Check size={14} aria-hidden />
      ) : (
        <AlertTriangle size={14} aria-hidden />
      )}
      <SmallBody>
        {label} — {ratio.toFixed(1)}:1{ok ? "" : ` ${needsNote}`}
      </SmallBody>
    </Flex>
  );
}

function ThemePreview({
  theme,
  mode,
}: {
  theme: CollectionTheme;
  mode: "light" | "dark";
}) {
  const palette = buildMagazinePalette(theme);
  if (!palette) return null;
  const vars = mode === "dark" ? palette.dark : palette.light;
  const paletteVars = styles.paletteVars(
    vars["--paper"],
    vars["--ink"],
    vars["--ink-soft"],
    vars["--muted"],
    vars["--line"],
    vars["--accent"],
    vars["--accent-ink"],
    theme.accentForeground ?? "#ffffff",
    theme.fontTitle ? `"${theme.fontTitle}"` : null,
    theme.fontBody ? `"${theme.fontBody}"` : null,
  );
  const fontsHref = googleFontsHref(theme);
  return (
    <div
      {...stylex.props(
        styles.preview,
        mode === "dark" && styles.previewStageDark,
      )}
    >
      {fontsHref ? <link rel="stylesheet" href={fontsHref} /> : null}
      <div {...stylex.props(styles.previewInner, paletteVars)}>
        <div {...stylex.props(styles.previewKicker)}>
          <Trans>Your series</Trans>
        </div>
        <div {...stylex.props(styles.previewRule)} aria-hidden />
        <h3 {...stylex.props(styles.previewTitle)}>
          <Trans>The Issue Title</Trans>
        </h3>
        <p {...stylex.props(styles.previewBody)}>
          <Trans>
            A sentence of body copy, set in your chosen fonts and colors, so you
            can see how it all reads together before you save.
          </Trans>
        </p>
        <div {...stylex.props(styles.previewTocRow)}>
          <span {...stylex.props(styles.previewTocN)}>01</span>
          <span {...stylex.props(styles.previewTocT)}>
            <Trans>An included article</Trans>
          </span>
          <span {...stylex.props(styles.previewTocP)}>
            <Trans>Series</Trans>
          </span>
        </div>
        <div {...stylex.props(styles.previewAccentPill)}>
          <Trans>Read the piece →</Trans>
        </div>
      </div>
    </div>
  );
}

function ThemeForm({
  theme,
  publicationRkey,
  close,
}: {
  theme: CollectionsTheme;
  publicationRkey: string;
  close: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [background, setBackground] = useState(
    theme.background ?? DEFAULTS.background,
  );
  const [foreground, setForeground] = useState(
    theme.foreground ?? DEFAULTS.foreground,
  );
  const [accent, setAccent] = useState(theme.accent ?? DEFAULTS.accent);
  const [accentForeground, setAccentForeground] = useState(
    theme.accentForeground ?? DEFAULTS.accentForeground,
  );
  const [fontTitle, setFontTitle] = useState(theme.fontTitle ?? "");
  const [fontBody, setFontBody] = useState(theme.fontBody ?? "");
  const [previewMode, setPreviewMode] = useState<"light" | "dark">(
    themePrefersDark({ background: theme.background } as CollectionTheme)
      ? "dark"
      : "light",
  );

  const saveMutation = useMutation(
    collectionsApi.putCollectionsThemeMutationOptions(),
  );

  const previewTheme: CollectionTheme = {
    background,
    foreground,
    accent,
    accentForeground,
    fontTitle: fontTitle.trim() || null,
    fontBody: fontBody.trim() || null,
  };

  const save = () => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(
      {
        publicationRkey,
        colors: { background, foreground, accent, accentForeground },
        fonts: {
          title: fontTitle.trim() || undefined,
          body: fontBody.trim() || undefined,
        },
      },
      {
        onSuccess: close,
        onSettled: () => {
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublication"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublications"],
          });
        },
      },
    );
  };

  return (
    <>
      <DialogBody>
        <Flex gap="4xl" style={styles.columns}>
          <Flex direction="column" gap="6xl" style={styles.controls}>
            <Flex direction="column" gap="2xl">
              <span {...stylex.props(styles.sectionHead)}>
                <Trans>Colors</Trans>
              </span>
              <ColorRow
                label={t`Background`}
                value={background}
                onChange={setBackground}
              />
              <ColorRow
                label={t`Text`}
                value={foreground}
                onChange={setForeground}
              />
              <ColorRow label={t`Accent`} value={accent} onChange={setAccent} />
              <ColorRow
                label={t`Accent text`}
                value={accentForeground}
                onChange={setAccentForeground}
              />
            </Flex>
            <Flex direction="column" gap="2xl">
              <span {...stylex.props(styles.sectionHead)}>
                <Trans>Fonts</Trans>
              </span>
              <ReadingCustomFontPicker
                label={t`Title font`}
                value={fontTitle}
                onChange={setFontTitle}
              />
              <ReadingCustomFontPicker
                label={t`Body font`}
                value={fontBody}
                onChange={setFontBody}
              />
            </Flex>
          </Flex>

          <Flex direction="column" gap="2xl" style={styles.previewCol}>
            <Flex align="center" justify="between" gap="md">
              <SmallBody variant="secondary">
                <Trans>Preview</Trans>
              </SmallBody>
              <SegmentedControl
                aria-label={t`Preview mode`}
                selectedKeys={new Set([previewMode])}
                onSelectionChange={(keys) => {
                  const next = [...keys][0];
                  if (next === "light" || next === "dark") setPreviewMode(next);
                }}
              >
                <SegmentedControlItem id="light">
                  <Trans>Light</Trans>
                </SegmentedControlItem>
                <SegmentedControlItem id="dark">
                  <Trans>Dark</Trans>
                </SegmentedControlItem>
              </SegmentedControl>
            </Flex>
            <ThemePreview theme={previewTheme} mode={previewMode} />

            <Flex direction="column" gap="sm">
              <span {...stylex.props(styles.sectionHead)}>
                <Trans>Contrast</Trans>
              </span>
              <ContrastCheck
                label={t`Text on background`}
                ratio={contrastRatio(foreground, background)}
                min={4.5}
              />
              <ContrastCheck
                label={t`Accent on background`}
                ratio={contrastRatio(accent, background)}
                min={3}
              />
              <ContrastCheck
                label={t`Text on accent`}
                ratio={contrastRatio(accentForeground, accent)}
                min={4.5}
              />
            </Flex>
          </Flex>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          isDisabled={saveMutation.isPending}
          onPress={save}
        >
          <Trans>Save theme</Trans>
        </Button>
      </DialogFooter>
    </>
  );
}

/** Edit a collections publication's shared theme (colors + Google fonts). */
export function CollectionThemeEditor({
  isOpen,
  onOpenChange,
  theme,
  publicationRkey,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  theme: CollectionsTheme;
  publicationRkey: string;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>
          <Trans>Theme &amp; fonts</Trans>
        </span>
      </DialogHeader>
      <ThemeForm
        key={isOpen ? publicationRkey : "closed"}
        theme={theme}
        publicationRkey={publicationRkey}
        close={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
