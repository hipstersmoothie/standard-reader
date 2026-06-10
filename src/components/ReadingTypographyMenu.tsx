import type {
  ReadingBodyFont,
  ReadingFontSize,
  ReadingMeasure,
} from "#/lib/reading-typography";

import * as stylex from "@stylexjs/stylex";
import { MenuItem, MenuSeparator, SubMenu } from "#/design-system/menu";
import { uiColor } from "#/design-system/theme/color.stylex";
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
  const { preference, setPreference } = useReadingTypography();
  const summary = readingTypographySummary(preference);

  return (
    <SubMenu
      trigger={
        <MenuItem
          suffix={
            <span {...stylex.props(styles.currentSummary)}>{summary}</span>
          }
        >
          Reading
        </MenuItem>
      }
    >
      <MenuItem isDisabled>
        <span {...stylex.props(styles.sectionLabel)}>Text size</span>
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
      <MenuItem isDisabled>
        <span {...stylex.props(styles.sectionLabel)}>Column width</span>
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
      <MenuItem isDisabled>
        <span {...stylex.props(styles.sectionLabel)}>Body font</span>
      </MenuItem>
      {READING_BODY_FONTS.map((bodyFont: ReadingBodyFont) => (
        <MenuItem
          key={bodyFont}
          onAction={() => setPreference({ bodyFont })}
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
