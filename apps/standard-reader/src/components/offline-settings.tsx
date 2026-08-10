"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Separator } from "@standard-reader/design-system/separator";
import { Switch } from "@standard-reader/design-system/switch";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { usePersistentToggle } from "#/lib/use-persistent-toggle";
import type { OfflineStorageUsage } from "#/pwa/offline-cache";
import { clearOfflineData, offlineStorageUsage } from "#/pwa/offline-cache";
import {
  OFFLINE_READING_STORAGE_KEY,
  runOfflineSync,
  stopOfflineSync,
} from "#/pwa/offline-sync";
import { isStandalone } from "#/pwa/standalone";

import { SettingRow } from "./settings-row";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Offline reading controls.
 *
 * Renders nothing outside the installed app: sync only runs there (see
 * `runOfflineSync`), so on the website these would be switches that do nothing.
 */
export function OfflineReadingSettings() {
  const { t } = useLingui();
  const router = useRouter();
  const [installed, setInstalled] = useState(false);
  const [enabled, setEnabled] = usePersistentToggle(
    OFFLINE_READING_STORAGE_KEY,
    true,
  );
  const [usage, setUsage] = useState<OfflineStorageUsage | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  const refreshUsage = useCallback(() => {
    void offlineStorageUsage().then(setUsage);
  }, []);

  useEffect(refreshUsage, [refreshUsage]);

  if (!installed) return null;

  const onToggle = (next: boolean) => {
    setEnabled(next);
    if (next) {
      // `usePersistentToggle` has already written the key, so the sync's own
      // enabled check passes on this call.
      void runOfflineSync(router).then(refreshUsage);
    } else {
      stopOfflineSync();
    }
  };

  return (
    <>
      <Separator />
      <SettingRow
        label={t`Keep unread articles on this device`}
        description={t`Downloads the articles you haven't read yet, with their images, so they open with no connection. Pauses automatically when your system asks apps to save data.`}
      >
        <Switch
          isSelected={enabled}
          onChange={onToggle}
          aria-label={t`Keep unread articles on this device`}
        />
      </SettingRow>
      <Separator />
      <SettingRow
        label={t`Downloaded articles`}
        description={
          usage
            ? t`Standard Reader is using ${formatBytes(usage.usage)} on this device.`
            : t`Storage use isn't available in this browser.`
        }
      >
        <Button
          variant="secondary"
          isDisabled={clearing}
          onPress={() => {
            setClearing(true);
            void clearOfflineData()
              .then(refreshUsage)
              .finally(() => setClearing(false));
          }}
        >
          <Trans>Remove</Trans>
        </Button>
      </SettingRow>
    </>
  );
}
