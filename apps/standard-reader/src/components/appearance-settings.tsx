"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  ColorPicker,
  DefaultColorEditor,
} from "@standard-reader/design-system/color-picker";
import { Flex } from "@standard-reader/design-system/flex";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { Separator } from "@standard-reader/design-system/separator";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { mediaQueries } from "@standard-reader/design-system/theme/media-queries.stylex";
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
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
} from "react-aria-components";

import { contrastRatio } from "#/lib/collections/color";
import { DEFAULT_CUSTOM_GOOGLE_FONT } from "#/lib/google-fonts";

import type {
  AppearanceDensity,
  AppearanceFont,
  AppearanceRoundness,
  AppearanceTextSize,
  PaletteId,
} from "../lib/appearance";
import {
  APPEARANCE_DENSITIES,
  APPEARANCE_FONTS,
  APPEARANCE_ROUNDNESS,
  APPEARANCE_TEXT_SIZES,
  DEFAULT_APPEARANCE,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_PAPER,
  PALETTES,
  appearanceIsDefault,
  appearanceScheme,
} from "../lib/appearance";
import { useAppearance } from "../lib/use-appearance";
import { paletteThemes } from "./reader/appearance-themes";
import { customPaletteVars } from "./reader/appearance-vars";
import { ReadingCustomFontPicker } from "./reading-custom-font-picker";
import { SettingRow } from "./settings-row";
import { settingRowStyles } from "./settings-row-styles";

const MOBILE = "@media (max-width: 47.5rem)";

/** How long a color can be dragged before the whole app repaints to match. */
const COLOR_COMMIT_DELAY_MS = 200;

const FONT_LABELS: Record<AppearanceFont, MessageDescriptor> = {
  editorial: msg`Editorial`,
  sans: msg`Sans`,
  custom: msg`Custom`,
};

/**
 * Five steps need short labels to stay on one line on mobile, so the control
 * shows the abbreviations and the accessible name says the whole word.
 */
const TEXT_SIZE_LABELS: Record<AppearanceTextSize, MessageDescriptor> = {
  xs: msg`XS`,
  small: msg`S`,
  default: msg`M`,
  large: msg`L`,
  xl: msg`XL`,
};

const TEXT_SIZE_NAMES: Record<AppearanceTextSize, MessageDescriptor> = {
  xs: msg`Extra small`,
  small: msg`Small`,
  default: msg`Default`,
  large: msg`Large`,
  xl: msg`Extra large`,
};

const ROUNDNESS_LABELS: Record<AppearanceRoundness, MessageDescriptor> = {
  sharp: msg`Sharp`,
  soft: msg`Soft`,
  default: msg`Default`,
};

const DENSITY_LABELS: Record<AppearanceDensity, MessageDescriptor> = {
  compact: msg`Compact`,
  default: msg`Default`,
  relaxed: msg`Relaxed`,
};

const styles = stylex.create({
  block: {
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  groupLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.md,
    marginTop: verticalSpace.none,
  },
  tileGrid: {
    display: "grid",
    gap: gap.xl,
    gridTemplateColumns: {
      default: "repeat(auto-fill, minmax(7.5rem, 1fr))",
      [MOBILE]: "repeat(auto-fill, minmax(6.5rem, 1fr))",
    },
  },
  radioGroup: {
    display: "flex",
    flexDirection: "column",
    gap: gap["4xl"],
    marginTop: verticalSpace["3xl"],
  },
  tile: {
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: gap.sm,
  },
  /**
   * The miniature wears the palette's own StyleX theme, so what a reader sees
   * here is the palette itself — same tokens the page will use, not a swatch
   * approximating them.
   */
  tileSurface: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    display: "flex",
    flexDirection: "column",
    gap: gap.sm,
    justifyContent: "center",
    outlineColor: {
      default: "transparent",
      ":is([data-selected])": primaryColor.solid1,
    },
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 2,
    paddingBottom: verticalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace.xl,
    transform: {
      default: "none",
      ":is([data-hovered]):not([data-selected])": "translateY(-2px)",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "outline-color, transform, border-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-out",
  },
  tileSurfaceFocused: {
    outlineColor: focusColor.ring,
  },
  tileTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.none,
  },
  tileLine: {
    backgroundColor: uiColor.text1,
    borderRadius: radius.full,
    height: 2,
    opacity: 0.5,
    width: "100%",
  },
  tileLineShort: {
    width: "60%",
  },
  tileAccent: {
    backgroundColor: primaryColor.solid1,
    borderRadius: radius.full,
    height: spacing["2"],
    marginTop: verticalSpace.xs,
    width: spacing["6"],
  },
  tileMeta: {
    alignItems: "center",
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    gap: gap.xs,
    justifyContent: "space-between",
  },
  tileCheck: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  editor: {
    display: "flex",
    flexDirection: {
      default: "row",
      [MOBILE]: "column",
    },
    gap: gap["4xl"],
    marginTop: verticalSpace["3xl"],
  },
  editorColumn: {
    display: "flex",
    flexBasis: "0",
    flexDirection: "column",
    flexGrow: 1,
    gap: gap.xl,
    minWidth: 0,
  },
  checkRow: {
    alignItems: "center",
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    gap: gap.sm,
    lineHeight: lineHeight.sm,
  },
  checkOk: {
    color: uiColor.text1,
  },
  checkWarn: {
    color: primaryColor.text1,
  },
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "46ch",
  },
  ratio: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.normal,
  },
});

/** The palette a tile paints itself in — real theme classes, real tokens. */
function PaletteTile({
  id,
  name,
  vars,
  scheme,
  isSelected,
  isFocusVisible,
}: {
  id: PaletteId;
  name: string;
  vars?: React.CSSProperties;
  scheme: "light" | "dark";
  isSelected: boolean;
  /** Keyboard focus outranks selection for the ring, so it stays visible. */
  isFocusVisible: boolean;
}) {
  return (
    <>
      <div
        data-selected={isSelected || undefined}
        {...stylex.props(
          ...paletteThemes(id),
          styles.tileSurface,
          isFocusVisible && styles.tileSurfaceFocused,
        )}
        // The palette states its scheme, so the miniature pins `color-scheme`
        // the same way the shell does — that is what resolves `light-dark()`
        // inside every Radix scale to the right half.
        style={{ ...vars, colorScheme: scheme }}
      >
        <span {...stylex.props(styles.tileTitle)} aria-hidden>
          Aa
        </span>
        <span {...stylex.props(styles.tileLine)} aria-hidden />
        <span
          {...stylex.props(styles.tileLine, styles.tileLineShort)}
          aria-hidden
        />
        <span {...stylex.props(styles.tileAccent)} aria-hidden />
      </div>
      <span {...stylex.props(styles.tileMeta)}>
        {name}
        {isSelected ? (
          <Check size={14} {...stylex.props(styles.tileCheck)} aria-hidden />
        ) : null}
      </span>
    </>
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
  const passes = ratio >= min;
  return (
    <span
      {...stylex.props(
        styles.checkRow,
        passes ? styles.checkOk : styles.checkWarn,
      )}
    >
      {passes ? (
        <Check size={14} aria-hidden />
      ) : (
        <AlertTriangle size={14} aria-hidden />
      )}
      <span>
        {label}{" "}
        <span {...stylex.props(styles.ratio)}>{ratio.toFixed(1)}:1</span>
      </span>
    </span>
  );
}

/**
 * Accent + paper, with the contrast the *generated* palette actually renders —
 * scored on the ramp's own text step rather than the raw pair, because that
 * step is what the reader will be reading.
 */
function CustomColorEditor({
  paper,
  accent,
  onChange,
}: {
  paper: string;
  accent: string;
  onChange: (next: { paper: string; accent: string }) => void;
}) {
  const { t } = useLingui();
  const scheme = appearanceScheme({
    ...DEFAULT_APPEARANCE,
    palette: "custom",
    customPaper: paper,
    customAccent: accent,
  });
  const vars = customPaletteVars(paper, accent) as Record<string, string>;
  const renderedPaper = vars[`--sr-bg-${scheme}`] ?? paper;
  const renderedInk = vars[`--sr-text2-${scheme}`] ?? "#000000";
  const renderedAccentText = vars[`--sr-accent-text2-${scheme}`] ?? accent;
  const rawAccentRatio = contrastRatio(accent, renderedPaper);

  return (
    <div {...stylex.props(styles.editor)}>
      <div {...stylex.props(styles.editorColumn)}>
        <ColorPicker
          label={t`Paper`}
          value={paper}
          onChange={(color) =>
            onChange({ paper: color.toString("hex"), accent })
          }
        >
          <DefaultColorEditor />
        </ColorPicker>
        <ColorPicker
          label={t`Accent`}
          value={accent}
          onChange={(color) =>
            onChange({ paper, accent: color.toString("hex") })
          }
        >
          <DefaultColorEditor />
        </ColorPicker>
      </div>
      <div {...stylex.props(styles.editorColumn)}>
        <ContrastCheck
          label={t`Body text on paper`}
          ratio={contrastRatio(renderedInk, renderedPaper)}
          min={4.5}
        />
        <ContrastCheck
          label={t`Links and labels on paper`}
          ratio={contrastRatio(renderedAccentText, renderedPaper)}
          min={4.5}
        />
        <p {...stylex.props(styles.note)}>
          {scheme === "dark" ? (
            <Trans>
              Your paper is dark, so the app reads as a dark theme. Text,
              borders and every other step are derived from these two colors.
            </Trans>
          ) : (
            <Trans>
              Text, borders and every other step are derived from these two
              colors.
            </Trans>
          )}
          {rawAccentRatio < 3 ? (
            <>
              {" "}
              {/* Stated, not corrected: the reader picked this color, so we keep
                  it and tell them what it will cost to read. */}
              <Trans>
                Your accent sits close to the paper in tone — it stays exactly
                as you picked it, but text and links set in it will be hard to
                read.
              </Trans>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/**
 * Palette picker for the `custom` theme mode: curated pairs grouped by the
 * scheme they render in, then the reader's own two colors.
 */
export function AppearancePalettePanel() {
  const { t } = useLingui();
  const { preference, setPreference } = useAppearance();
  const [draft, setDraft] = useState({
    paper: preference.customPaper ?? DEFAULT_CUSTOM_PAPER,
    accent: preference.customAccent ?? DEFAULT_CUSTOM_ACCENT,
  });

  const savedPaper = preference.customPaper;
  const savedAccent = preference.customAccent;

  // Adopt colors that changed elsewhere (another tab, a reset) without fighting
  // the reader mid-drag: only when the saved pair differs from what we sent.
  useEffect(() => {
    if (!savedPaper || !savedAccent) return;
    setDraft((current) =>
      current.paper === savedPaper && current.accent === savedAccent
        ? current
        : { paper: savedPaper, accent: savedAccent },
    );
  }, [savedAccent, savedPaper]);

  // A color wheel fires continuously while dragged; the tile follows every
  // frame from local state, and the app itself repaints once the reader
  // settles — one write, not a hundred.
  useEffect(() => {
    if (preference.palette !== "custom") return;
    if (draft.paper === savedPaper && draft.accent === savedAccent) return;
    const timer = globalThis.setTimeout(() => {
      setPreference({
        customPaper: draft.paper,
        customAccent: draft.accent,
      });
    }, COLOR_COMMIT_DELAY_MS);
    return () => globalThis.clearTimeout(timer);
  }, [
    draft.accent,
    draft.paper,
    preference.palette,
    savedAccent,
    savedPaper,
    setPreference,
  ]);

  const lightPalettes = PALETTES.filter(
    (palette) => palette.scheme === "light",
  );
  const darkPalettes = PALETTES.filter((palette) => palette.scheme === "dark");
  const customScheme = appearanceScheme({
    ...DEFAULT_APPEARANCE,
    palette: "custom",
    customPaper: draft.paper,
    customAccent: draft.accent,
  });
  const customVars = customPaletteVars(
    draft.paper,
    draft.accent,
  ) as React.CSSProperties;

  const renderTile = (
    id: PaletteId,
    name: string,
    scheme: "light" | "dark",
    label: string,
    vars?: React.CSSProperties,
  ) => (
    <AriaRadio
      key={id}
      value={id}
      aria-label={label}
      {...stylex.props(styles.tile)}
    >
      {({ isSelected, isFocusVisible }) => (
        <PaletteTile
          id={id}
          name={name}
          scheme={scheme}
          vars={vars}
          isSelected={isSelected}
          isFocusVisible={isFocusVisible}
        />
      )}
    </AriaRadio>
  );

  return (
    <div {...stylex.props(styles.block)}>
      <p {...stylex.props(settingRowStyles.label)}>
        <Trans>Palette</Trans>
      </p>
      <p {...stylex.props(settingRowStyles.description)}>
        <Trans>
          Sets the app's colors — and, because the page color decides it,
          whether the app reads light or dark.
        </Trans>
      </p>

      <AriaRadioGroup
        aria-label={t`Palette`}
        value={preference.palette}
        onChange={(value) => setPreference({ palette: value as PaletteId })}
        {...stylex.props(styles.radioGroup)}
      >
        <div>
          <p {...stylex.props(styles.groupLabel)}>
            <Trans>Light</Trans>
          </p>
          <div {...stylex.props(styles.tileGrid)}>
            {lightPalettes.map((palette) =>
              renderTile(
                palette.id,
                palette.name,
                palette.scheme,
                t`${palette.name}, light`,
              ),
            )}
          </div>
        </div>

        <div>
          <p {...stylex.props(styles.groupLabel)}>
            <Trans>Dark</Trans>
          </p>
          <div {...stylex.props(styles.tileGrid)}>
            {darkPalettes.map((palette) =>
              renderTile(
                palette.id,
                palette.name,
                palette.scheme,
                t`${palette.name}, dark`,
              ),
            )}
          </div>
        </div>

        <div>
          <p {...stylex.props(styles.groupLabel)}>
            <Trans>Your own colors</Trans>
          </p>
          <div {...stylex.props(styles.tileGrid)}>
            {renderTile(
              "custom",
              t`Custom`,
              customScheme,
              t`Your own colors`,
              customVars,
            )}
          </div>
        </div>
      </AriaRadioGroup>

      {preference.palette === "custom" ? (
        <CustomColorEditor
          paper={draft.paper}
          accent={draft.accent}
          onChange={setDraft}
        />
      ) : null}
    </div>
  );
}

/**
 * Shape and type: applies in every theme mode, because none of it is color.
 * The article inherits all of it as a baseline — the Reading section below
 * still overrides the article on top.
 */
export function AppearanceAdvancedRows() {
  const { t, i18n } = useLingui();
  const { preference, setPreference, reset } = useAppearance();
  const isDefault = appearanceIsDefault(preference);

  return (
    <>
      <SettingRow
        label={t`Interface font`}
        description={t`The typeface used across the app. Article text follows this too, unless you set a reading font below.`}
      >
        <SegmentedControl
          aria-label={t`Interface font`}
          selectedKeys={new Set([preference.font])}
          onSelectionChange={(keys: Set<React.Key> | "all") => {
            const key = keys === "all" ? undefined : String([...keys][0]);
            if (!key) return;
            if (key === "custom") {
              setPreference({
                font: "custom",
                customFontFamily:
                  preference.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT,
              });
              return;
            }
            if (isAppearanceFontKey(key)) {
              setPreference({ font: key, customFontFamily: undefined });
            }
          }}
          style={settingRowStyles.segmentedControl}
        >
          {APPEARANCE_FONTS.map((font) => (
            <SegmentedControlItem key={font} id={font}>
              {i18n._(FONT_LABELS[font])}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </SettingRow>

      {preference.font === "custom" ? (
        <>
          <Separator />
          <SettingRow
            label={t`Google Font`}
            description={t`Search and pick any family from the Google Fonts catalog.`}
          >
            <ReadingCustomFontPicker
              value={preference.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT}
              onChange={(family) =>
                setPreference({ font: "custom", customFontFamily: family })
              }
            />
          </SettingRow>
        </>
      ) : null}

      <Separator />
      <SettingRow
        label={t`Text size`}
        description={t`Scales every size in the app, article text included — from 13px up to 22px of interface text.`}
      >
        <SegmentedControl
          aria-label={t`Text size`}
          selectedKeys={new Set([preference.textSize])}
          onSelectionChange={(keys: Set<React.Key> | "all") => {
            const key = keys === "all" ? undefined : String([...keys][0]);
            if (isTextSizeKey(key)) setPreference({ textSize: key });
          }}
          style={settingRowStyles.segmentedControl}
        >
          {APPEARANCE_TEXT_SIZES.map((option) => (
            <SegmentedControlItem
              key={option}
              id={option}
              aria-label={i18n._(TEXT_SIZE_NAMES[option])}
            >
              {i18n._(TEXT_SIZE_LABELS[option])}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </SettingRow>

      <Separator />
      <SettingRow
        label={t`Roundness`}
        description={t`How rounded buttons, cards and inputs are.`}
      >
        <SegmentedControl
          aria-label={t`Roundness`}
          selectedKeys={new Set([preference.roundness])}
          onSelectionChange={(keys: Set<React.Key> | "all") => {
            const key = keys === "all" ? undefined : String([...keys][0]);
            if (isRoundnessKey(key)) setPreference({ roundness: key });
          }}
          style={settingRowStyles.segmentedControl}
        >
          {APPEARANCE_ROUNDNESS.map((option) => (
            <SegmentedControlItem key={option} id={option}>
              {i18n._(ROUNDNESS_LABELS[option])}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </SettingRow>

      <Separator />
      <SettingRow
        label={t`Density`}
        description={t`The spacing between things — tighter for more on screen, looser for more room to read.`}
      >
        <SegmentedControl
          aria-label={t`Density`}
          selectedKeys={new Set([preference.density])}
          onSelectionChange={(keys: Set<React.Key> | "all") => {
            const key = keys === "all" ? undefined : String([...keys][0]);
            if (isDensityKey(key)) setPreference({ density: key });
          }}
          style={settingRowStyles.segmentedControl}
        >
          {APPEARANCE_DENSITIES.map((option) => (
            <SegmentedControlItem key={option} id={option}>
              {i18n._(DENSITY_LABELS[option])}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </SettingRow>

      <Separator />
      <SettingRow
        label={t`Reset appearance`}
        description={t`Puts the palette, font, size, roundness and density back to their defaults.`}
      >
        <Flex justify="end">
          <Button variant="secondary" isDisabled={isDefault} onPress={reset}>
            <Trans>Reset</Trans>
          </Button>
        </Flex>
      </SettingRow>
    </>
  );
}

function isAppearanceFontKey(value: string): value is AppearanceFont {
  return (APPEARANCE_FONTS as ReadonlyArray<string>).includes(value);
}

function isTextSizeKey(value: string | undefined): value is AppearanceTextSize {
  return (
    value !== undefined &&
    (APPEARANCE_TEXT_SIZES as ReadonlyArray<string>).includes(value)
  );
}

function isRoundnessKey(
  value: string | undefined,
): value is AppearanceRoundness {
  return (
    value !== undefined &&
    (APPEARANCE_ROUNDNESS as ReadonlyArray<string>).includes(value)
  );
}

function isDensityKey(value: string | undefined): value is AppearanceDensity {
  return (
    value !== undefined &&
    (APPEARANCE_DENSITIES as ReadonlyArray<string>).includes(value)
  );
}
