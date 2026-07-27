import { Trans, useLingui } from "@lingui/react/macro";
import {
  MenuItem,
  MenuSeparator,
  SubMenu,
} from "@standard-reader/design-system/menu";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import * as stylex from "@stylexjs/stylex";

import { DEFAULT_CUSTOM_GOOGLE_FONT } from "#/lib/google-fonts";
import type {
  ReadingBodyFont,
  ReadingFontSize,
  ReadingMeasure,
} from "#/lib/reading-typography";
import {
  READING_BODY_FONTS,
  READING_FONT_SIZES,
  READING_MEASURES,
  readingBodyFontLabel,
  readingFontSizeLabel,
  readingMeasureLabel,
  readingTypographySummary,
} from "#/lib/reading-typography";
import { useReadingTypography } from "#/lib/use-reading-typography";

const styles = stylex.create({
  currentSummary: {
    color: uiColor.text1,
  },
  sectionLabel: {
    color: uiColor.text1,
    fontWeight: 600,
  },
  selected: {
    color: uiColor.text1,
  },
});

function SelectedSuffix({ selected }: { selected: boolean }) {
  return selected ? <span {...stylex.props(styles.selected)}>✓</span> : null;
}

export function ReadingTypographySubMenu() {
  const { t } = useLingui();
  const { preference, setPreference } = useReadingTypography();
  const summary = readingTypographySummary(preference);

  return (
    <SubMenu
      trigger={
        <MenuItem
          textValue={t`Reading`}
          suffix={
            <span {...stylex.props(styles.currentSummary)}>{summary}</span>
          }
        >
          <Trans>Reading</Trans>
        </MenuItem>
      }
    >
      <MenuItem isDisabled textValue={t`Text size`}>
        <span {...stylex.props(styles.sectionLabel)}>
          <Trans>Text size</Trans>
        </span>
      </MenuItem>
      {READING_FONT_SIZES.map((fontSize: ReadingFontSize) => (
        <MenuItem
          key={fontSize}
          onAction={() => setPreference({ fontSize })}
          suffix={
            <SelectedSuffix selected={preference.fontSize === fontSize} />
          }
        >
          {readingFontSizeLabel(fontSize)}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem isDisabled textValue={t`Column width`}>
        <span {...stylex.props(styles.sectionLabel)}>
          <Trans>Column width</Trans>
        </span>
      </MenuItem>
      {READING_MEASURES.map((measure: ReadingMeasure) => (
        <MenuItem
          key={measure}
          onAction={() => setPreference({ measure })}
          suffix={<SelectedSuffix selected={preference.measure === measure} />}
        >
          {readingMeasureLabel(measure)}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem isDisabled textValue={t`Body font`}>
        <span {...stylex.props(styles.sectionLabel)}>
          <Trans>Body font</Trans>
        </span>
      </MenuItem>
      {READING_BODY_FONTS.map((bodyFont: ReadingBodyFont) => (
        <MenuItem
          key={bodyFont}
          onAction={() => {
            if (bodyFont === "custom") {
              setPreference({
                bodyFont: "custom",
                customFontFamily:
                  preference.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT,
              });
              return;
            }
            setPreference({ bodyFont, customFontFamily: undefined });
          }}
          suffix={
            <SelectedSuffix selected={preference.bodyFont === bodyFont} />
          }
        >
          {readingBodyFontLabel(bodyFont)}
        </MenuItem>
      ))}
    </SubMenu>
  );
}
