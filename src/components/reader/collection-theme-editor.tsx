"use client";

import type { CollectionsTheme } from "#/integrations/tanstack-query/api-collections.functions";
import type { CollectionTheme } from "#/lib/collections/theme";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { contrastRatio } from "#/lib/collections/color";
import {
  buildMagazinePalette,
  themePrefersDark,
} from "#/lib/collections/radix-theme";
import { googleFontsHref } from "#/magazine/theme-vars";
import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

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
import { LabelText, SmallBody } from "../../design-system/typography";
import { ReadingCustomFontPicker } from "../reading-custom-font-picker";
import { radius } from "../../design-system/theme/radius.stylex";
import { uiColor } from "../../design-system/theme/color.stylex";
import {
  fontFamily,
  fontSize,
} from "../../design-system/theme/typography.stylex";

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
    borderColor: "color-mix(in oklab, var(--ink) 18%, transparent)",
    padding: "1.25rem",
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
    marginBottom: '0.75rem',
    marginLeft: '0',
    marginRight: '0',
    marginTop: '0.6rem',
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
    marginBottom: '0',
    color: "var(--ink-soft)",
    marginRight: '0',
    marginTop: '0.75rem',
    fontFamily: "var(--prev-body, serif)",
    fontSize: "0.8rem",
    lineHeight: 1.5,
    marginLeft: '0',
  },
  previewTocRow: {
    alignItems: "baseline",
    columnGap: '0.6rem',
    display: "flex",
    rowGap: '0.6rem',
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
    borderRadius: "999px",
    backgroundColor: "var(--accent)",
    color: "var(--accent-contrast)",
    display: "inline-block",
    fontFamily: "var(--prev-body, sans-serif)",
    fontSize: "0.7rem",
    fontWeight: 600,
    marginTop: "0.85rem",
    paddingBottom: "0.3rem",
    paddingLeft: "0.7rem",
    paddingRight: "0.7rem",
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
    "--ink": ink,
    "--accent-ink": accentInk,
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
  const ok = ratio >= min;
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
        {label} — {ratio.toFixed(1)}:1{ok ? "" : ` (needs ${min}:1)`}
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
        <div {...stylex.props(styles.previewKicker)}>Your series</div>
        <div {...stylex.props(styles.previewRule)} aria-hidden />
        <h3 {...stylex.props(styles.previewTitle)}>The Issue Title</h3>
        <p {...stylex.props(styles.previewBody)}>
          A sentence of body copy, set in your chosen fonts and colors, so you
          can see how it all reads together before you save.
        </p>
        <div {...stylex.props(styles.previewTocRow)}>
          <span {...stylex.props(styles.previewTocN)}>01</span>
          <span {...stylex.props(styles.previewTocT)}>An included article</span>
          <span {...stylex.props(styles.previewTocP)}>Series</span>
        </div>
        <div {...stylex.props(styles.previewAccentPill)}>Read the piece →</div>
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
          <Flex direction="column" gap="4xl" style={styles.controls}>
            <Flex direction="column" gap="lg">
              <span {...stylex.props(styles.sectionHead)}>Colors</span>
              <ColorRow
                label="Background"
                value={background}
                onChange={setBackground}
              />
              <ColorRow
                label="Text"
                value={foreground}
                onChange={setForeground}
              />
              <ColorRow label="Accent" value={accent} onChange={setAccent} />
              <ColorRow
                label="Accent text"
                value={accentForeground}
                onChange={setAccentForeground}
              />
            </Flex>
            <Flex direction="column" gap="lg">
              <span {...stylex.props(styles.sectionHead)}>Fonts</span>
              <Flex direction="column" gap="xs">
                <LabelText>Title font</LabelText>
                <ReadingCustomFontPicker
                  value={fontTitle}
                  onChange={setFontTitle}
                />
              </Flex>
              <Flex direction="column" gap="xs">
                <LabelText>Body font</LabelText>
                <ReadingCustomFontPicker
                  value={fontBody}
                  onChange={setFontBody}
                />
              </Flex>
            </Flex>
          </Flex>

          <Flex direction="column" gap="2xl" style={styles.previewCol}>
            <Flex align="center" justify="between" gap="md">
              <SmallBody variant="secondary">Preview</SmallBody>
              <SegmentedControl
                aria-label="Preview mode"
                selectedKeys={new Set([previewMode])}
                onSelectionChange={(keys) => {
                  const next = [...keys][0];
                  if (next === "light" || next === "dark") setPreviewMode(next);
                }}
              >
                <SegmentedControlItem id="light">Light</SegmentedControlItem>
                <SegmentedControlItem id="dark">Dark</SegmentedControlItem>
              </SegmentedControl>
            </Flex>
            <ThemePreview theme={previewTheme} mode={previewMode} />

            <Flex direction="column" gap="sm">
              <span {...stylex.props(styles.sectionHead)}>Contrast</span>
              <ContrastCheck
                label="Text on background"
                ratio={contrastRatio(foreground, background)}
                min={4.5}
              />
              <ContrastCheck
                label="Accent on background"
                ratio={contrastRatio(accent, background)}
                min={3}
              />
              <ContrastCheck
                label="Text on accent"
                ratio={contrastRatio(accentForeground, accent)}
                min={4.5}
              />
            </Flex>
          </Flex>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          isDisabled={saveMutation.isPending}
          onPress={save}
        >
          Save theme
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
        <span {...stylex.props(styles.headerTitle)}>Theme &amp; fonts</span>
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
