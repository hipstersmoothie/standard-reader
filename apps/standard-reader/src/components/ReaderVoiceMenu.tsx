import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Sparkles } from "lucide-react";

import { MenuItem, SubMenu } from "@standard-reader/design-system/menu";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { AMERICAN_ENGLISH_VOICES } from "#/lib/page-reader/voice-catalog";
import type { ReaderVoicePreference } from "#/lib/reader-voice";
import {
  isReaderVoicePreference,
  readerVoicePreferenceLabel,
} from "#/lib/reader-voice";
import { useReaderVoice } from "#/lib/use-reader-voice";

const styles = stylex.create({
  currentPreference: {
    color: uiColor.text1,
  },
  grade: {
    color: uiColor.text1,
  },
});

function ReaderVoiceMenuItems({
  onSelect,
}: {
  onSelect: (next: ReaderVoicePreference) => void;
}) {
  const { t } = useLingui();

  return (
    <>
      <MenuItem
        id="auto"
        prefix={<Sparkles size={16} />}
        textValue={t`Auto`}
        onAction={() => onSelect("auto")}
      >
        <Trans>Auto</Trans>
      </MenuItem>
      {AMERICAN_ENGLISH_VOICES.map((voice) => (
        <MenuItem
          key={voice.id}
          id={voice.id}
          suffix={
            <span {...stylex.props(styles.grade)}>{voice.overallGrade}</span>
          }
          onAction={() => {
            if (isReaderVoicePreference(voice.id)) onSelect(voice.id);
          }}
        >
          {voice.name}
        </MenuItem>
      ))}
    </>
  );
}

export function ReaderVoiceSubMenu() {
  const { t } = useLingui();
  const { preference, setPreference } = useReaderVoice();
  const currentLabel = readerVoicePreferenceLabel(preference);

  return (
    <SubMenu
      trigger={
        <MenuItem
          textValue={t`Reader voice`}
          suffix={
            <span {...stylex.props(styles.currentPreference)}>
              {currentLabel}
            </span>
          }
        >
          <Trans>Reader voice</Trans>
        </MenuItem>
      }
      selectionMode="single"
      selectedKeys={new Set([preference])}
      disallowEmptySelection
      onSelectionChange={(keys) => {
        const key = keys === "all" ? undefined : [...keys][0];
        if (isReaderVoicePreference(key)) setPreference(key);
      }}
    >
      <ReaderVoiceMenuItems onSelect={setPreference} />
    </SubMenu>
  );
}
