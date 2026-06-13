import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Checkbox } from "#/design-system/checkbox";
import { Flex } from "#/design-system/flex";
import { Select, SelectItem } from "#/design-system/select";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { Heading4 } from "#/design-system/typography";
import { Text } from "#/design-system/typography/text";
import { AMERICAN_ENGLISH_VOICES } from "#/lib/page-reader/voice-catalog";
import {
  DEFAULT_READER_VOICE_PREFERENCE,
  isReaderVoicePreference,
} from "#/lib/reader-voice";
import { Sparkles } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ExtensionThemeMode } from "../../lib/extension-theme";
import type { ExtensionSettings } from "../../lib/types";

import { ExtensionTheme } from "../../components/ExtensionTheme";
import { DEFAULT_SETTINGS } from "../../lib/config";
import { useExtensionTheme } from "../../lib/extension-theme-context";
import { sendMessage } from "../../lib/messaging";

const COLOR_SCHEME_OPTIONS = [
  { id: "light" as const, label: "Light" },
  { id: "dark" as const, label: "Dark" },
] satisfies ReadonlyArray<{ id: ExtensionThemeMode; label: string }>;

const READER_VOICE_OPTIONS = [
  { id: "auto" as const, label: "Auto" },
  ...AMERICAN_ENGLISH_VOICES.map((voice) => ({
    id: voice.id,
    label: `${voice.name} (${voice.overallGrade})`,
  })),
] as const;

if (!import.meta.env.DEV) {
  void import("../../load-stylex-styles");
}

const styles = stylex.create({
  container: {
    padding: spacing["6"],
  },
});

function ColorSchemeSelect() {
  const { mode, setMode } = useExtensionTheme();

  return (
    <Select
      label="Color scheme"
      items={COLOR_SCHEME_OPTIONS}
      value={mode}
      onChange={(key) => {
        if (key === "light" || key === "dark") {
          setMode(key);
        }
      }}
    >
      {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
    </Select>
  );
}

function ReaderVoiceSelect({
  value,
  onChange,
}: {
  value: ExtensionSettings["readerVoice"];
  onChange: (next: ExtensionSettings["readerVoice"]) => void;
}) {
  return (
    <Select
      label="Listen aloud voice"
      description="The voice used when you listen to an article with read aloud."
      items={READER_VOICE_OPTIONS}
      value={value}
      onChange={(key) => {
        if (isReaderVoicePreference(key)) onChange(key);
      }}
    >
      {(item) => (
        <SelectItem
          id={item.id}
          prefix={item.id === "auto" ? <Sparkles size={14} /> : undefined}
        >
          {item.label}
        </SelectItem>
      )}
    </Select>
  );
}

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>({
    overlayEnabled: DEFAULT_SETTINGS.overlayEnabled,
    bskyBadgesEnabled: DEFAULT_SETTINGS.bskyBadgesEnabled,
    readerVoice: DEFAULT_READER_VOICE_PREFERENCE,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void sendMessage({ type: "getSettings" }).then((data) => {
      setSettings(data);
    });
  }, []);

  const save = async () => {
    const data = await sendMessage({
      type: "saveSettings",
      settings,
    });
    setSettings(data);
    setSaved(true);
    globalThis.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ExtensionTheme variant="options">
      <Flex direction="column" gap="5xl" style={styles.container}>
        <Heading4>Standard Reader extension</Heading4>
        <Flex direction="column" gap="2xl">
          <ColorSchemeSelect />
          <ReaderVoiceSelect
            value={settings.readerVoice}
            onChange={(readerVoice) => {
              setSettings((current) => ({ ...current, readerVoice }));
            }}
          />
          <Checkbox
            isSelected={settings.overlayEnabled}
            onChange={(value) => {
              setSettings((current) => ({
                ...current,
                overlayEnabled: value,
              }));
            }}
          >
            Show page overlay on publication sites
          </Checkbox>
          <Checkbox
            isSelected={settings.bskyBadgesEnabled}
            onChange={(value) => {
              setSettings((current) => ({
                ...current,
                bskyBadgesEnabled: value,
              }));
            }}
          >
            Show save button on Bluesky article embeds
          </Checkbox>
        </Flex>
        <Button variant="primary" onPress={() => void save()}>
          Save settings
        </Button>
        {saved ? <Text color="muted">Settings saved.</Text> : null}
      </Flex>
    </ExtensionTheme>
  );
}

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  );
}
