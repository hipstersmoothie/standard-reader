import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Checkbox } from "#/design-system/checkbox";
import { Flex } from "#/design-system/flex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { Heading4 } from "#/design-system/typography";
import { Text } from "#/design-system/typography/text";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ExtensionSettings } from "../../lib/types";

import { ExtensionTheme } from "../../components/ExtensionTheme";
import { DEFAULT_SETTINGS } from "../../lib/config";
import { sendMessage } from "../../lib/messaging";

if (!import.meta.env.DEV) {
  void import("../../load-stylex-styles");
}

const styles = stylex.create({
  container: {
    padding: spacing["6"],
  },
});

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>({
    overlayEnabled: DEFAULT_SETTINGS.overlayEnabled,
    bskyBadgesEnabled: DEFAULT_SETTINGS.bskyBadgesEnabled,
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
