"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { Tag, TagGroup } from "@standard-reader/design-system/tag-group";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";

import type { ContentLanguageCode } from "#/lib/content-language";
import {
  CONTENT_LANGUAGES,
  contentLanguageLabel,
  isContentLanguage,
} from "#/lib/content-language";
import { useFeedLanguages } from "#/lib/use-feed-languages";

import { settingRowStyles } from "./settings-row-styles";

const MOBILE = "@media (max-width: 47.5rem)";

const styles = stylex.create({
  // The row's control column, holding more than one control: the picker, the
  // chips for what is chosen, and the reset. End-aligned like every other
  // row's control; full width once the row stacks on mobile.
  controls: {
    alignItems: {
      [MOBILE]: "stretch",
      default: "flex-end",
    },
  },
  note: {
    color: uiColor["text1"],
    fontSize: fontSize["xs"],
    lineHeight: lineHeight["sm"],
    marginBottom: verticalSpace["none"],
    marginTop: verticalSpace["sm"],
    maxWidth: "42ch",
  },
  picker: {
    width: {
      [MOBILE]: "100%",
      default: spacing["72"],
    },
  },
  chips: {
    justifyContent: {
      [MOBILE]: "flex-start",
      default: "flex-end",
    },
  },
});

/**
 * Settings → Feed → Languages.
 *
 * Laid out as a `SettingRow` (the row box and label/description styles), but
 * written out rather than using the component: its start column carries a
 * second note under the description, and its control column stacks the
 * picker, the chips for what is chosen, and a reset.
 *
 * Chips for what is chosen, a searchable picker to add one more. Not a
 * multi-select listbox: the chips are the answer to "what is my feed filtered
 * to right now", which is the question a reader has when they come back to this
 * page, and a 66-row listbox scrolled to the middle answers it badly.
 *
 * The picker is searchable and virtualized because the list is long, and
 * because the useful way to find a language is to type its name — in either its
 * own script or in English, which is what each item's `textValue` carries.
 */
export function FeedLanguagesSetting() {
  const { t } = useLingui();
  const { languages, setLanguages } = useFeedLanguages();

  const chosen = useMemo(() => new Set<string>(languages), [languages]);
  const available = useMemo(
    () => CONTENT_LANGUAGES.filter((entry) => !chosen.has(entry.code)),
    [chosen],
  );
  const chips = useMemo(
    () =>
      languages.map((code) => ({
        id: code,
        label: contentLanguageLabel(code),
      })),
    [languages],
  );

  return (
    <div {...stylex.props(settingRowStyles.row)}>
      <div>
        <p {...stylex.props(settingRowStyles.label)}>
          <Trans>Languages</Trans>
        </p>
        <p {...stylex.props(settingRowStyles.description)}>
          <Trans>
            Show only posts written in the languages you pick, on Latest,
            Discover, search, topics, and tag pages. Publications you subscribe
            to are never filtered, and neither is a post you open directly.
          </Trans>
        </p>
        <p {...stylex.props(styles.note)}>
          {languages.length === 0 ? (
            <Trans>
              Every language is shown, except on Trending, which sticks to
              English and your interface language. Pick one or more to narrow
              your feed.
            </Trans>
          ) : (
            <Trans>
              Posts whose language we could not detect are always shown — a
              filter never hides a post on a guess.
            </Trans>
          )}
        </p>
      </div>

      <Flex
        direction="column"
        gap="sm"
        style={[settingRowStyles.control, styles.controls]}
      >
        <div {...stylex.props(styles.picker)}>
          <Select
            isSearchable
            isVirtualized
            size="md"
            aria-label={t`Add a language`}
            placeholder={t`Add a language…`}
            placement="bottom end"
            shouldFlip
            shouldUpdatePosition
            shouldCloseOnInteractOutside={() => true}
            isDisabled={available.length === 0}
            // Never holds a value: choosing an option appends it to the chips
            // and the control resets, so it reads as an action rather than as a
            // second, contradictory source of truth beside them.
            selectedKey={null}
            onSelectionChange={(key) => {
              if (key == null) return;
              const code = String(key);
              if (!isContentLanguage(code)) return;
              setLanguages([...languages, code as ContentLanguageCode]);
            }}
          >
            {available.map((entry) => (
              <SelectItem
                key={entry.code}
                id={entry.code}
                // Both names, so typing "Japanese" or "日本語" finds the row.
                textValue={`${entry.label} ${entry.englishLabel}`}
              >
                {entry.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        {chips.length > 0 ? (
          <TagGroup
            aria-label={t`Languages your feed is filtered to`}
            items={chips}
            onRemove={(keys) => {
              setLanguages(languages.filter((code) => !keys.has(code)));
            }}
            style={styles.chips}
          >
            {(chip: { id: string; label: string }) => <Tag>{chip.label}</Tag>}
          </TagGroup>
        ) : null}

        {languages.length > 0 ? (
          <Button
            variant="tertiary"
            size="sm"
            onPress={() => {
              setLanguages([]);
            }}
          >
            <Trans>Show all languages</Trans>
          </Button>
        ) : null}
      </Flex>
    </div>
  );
}
