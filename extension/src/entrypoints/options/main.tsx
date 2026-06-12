import { Button } from "#/design-system/button";
import { Checkbox } from "#/design-system/checkbox";
import { Flex } from "#/design-system/flex";
import { TextField } from "#/design-system/text-field";
import { Heading4 } from "#/design-system/typography";
import { Text } from "#/design-system/typography/text";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ExtensionSettings } from "../../lib/types";

import { ExtensionTheme } from "../../components/ExtensionTheme";
import {
  DEFAULT_API_ORIGIN,
  DEFAULT_SETTINGS,
} from "../../lib/config";
import { sendMessage } from "../../lib/messaging";

if (!import.meta.env.DEV) {
  void import("../../load-stylex-styles");
}

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
      <Heading4>Standard Reader extension</Heading4>
      <Flex direction="column" gap="md">
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
          Show save badges on Bluesky links
        </Checkbox>
        <TextField
          label="API origin"
          description={`Leave blank for default (${DEFAULT_API_ORIGIN}). Bluesky OAuth requires 127.0.0.1 — not localhost.`}
          placeholder={DEFAULT_API_ORIGIN}
          value={settings.apiOrigin ?? ""}
          onChange={(value) => {
            setSettings((current) => ({
              ...current,
              apiOrigin: value || undefined,
            }));
          }}
        />
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
