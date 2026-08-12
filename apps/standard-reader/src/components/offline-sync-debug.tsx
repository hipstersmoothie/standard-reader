"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { OfflineStorageUsage } from "#/pwa/offline-cache";
import { offlineStorageUsage } from "#/pwa/offline-cache";
import { runOfflineSync, stopOfflineSync } from "#/pwa/offline-sync";
import {
  getOfflineSyncProgress,
  getOfflineSyncProgressServer,
  subscribeOfflineSyncProgress,
} from "#/pwa/offline-sync-progress";

const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    paddingBlock: verticalSpace.lg,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.xs,
  },
  intro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.md,
    marginTop: verticalSpace.none,
    maxWidth: "42ch",
  },
  row: {
    columnGap: gap.md,
    display: "flex",
    justifyContent: "space-between",
  },
  key: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  value: {
    color: uiColor.text2,
    // Monospace so a state string or an error is read exactly as written —
    // this gets screenshotted from a phone and read back.
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    overflowWrap: "anywhere",
    textAlign: "end",
  },
  actions: {
    columnGap: gap.md,
    display: "flex",
    marginTop: verticalSpace.md,
  },
});

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

// Debug surface: the device's own clock format is exactly what's wanted.
function stamp(at: number | null): string {
  return at === null ? "—" : new Date(at).toLocaleTimeString();
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.key)}>{label}</span>
      <span {...stylex.props(styles.value)}>{value}</span>
    </div>
  );
}

/**
 * Live view of the offline sync pass. The values are untranslated on purpose,
 * like the push diagnostics: this is a surface whose strings get read back
 * verbatim.
 *
 * "Run sync now" bypasses the installed-app gate, which is what makes offline
 * sync exercisable in a browser tab at all — on a device it also answers "is
 * sync broken or merely not running".
 */
export function OfflineSyncDebugPanel() {
  const router = useRouter();
  const progress = useSyncExternalStore(
    subscribeOfflineSyncProgress,
    getOfflineSyncProgress,
    getOfflineSyncProgressServer,
  );
  const [usage, setUsage] = useState<OfflineStorageUsage | null>(null);

  // Refresh the storage line while a pass runs; it is the pass's output.
  useEffect(() => {
    void offlineStorageUsage().then(setUsage);
    if (!progress.running) return;
    const interval = globalThis.setInterval(() => {
      void offlineStorageUsage().then(setUsage);
    }, 3000);
    return () => globalThis.clearInterval(interval);
  }, [progress.running]);

  const { counts } = progress;
  const status = progress.running
    ? `running (${progress.pass}) — ${progress.step ?? "…"}`
    : progress.stopReason
      ? `${progress.stopReason}${progress.error ? `: ${progress.error}` : ""}`
      : "not started";

  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.intro)}>
        <Trans>
          If articles aren’t available offline, this is what the last sync did.
          Sharing a screenshot of it is the fastest way to get it fixed.
        </Trans>
      </p>
      <Row label={<Trans>Status</Trans>} value={status} />
      <Row
        label={<Trans>Started / finished</Trans>}
        value={`${stamp(progress.startedAt)} / ${stamp(progress.finishedAt)}`}
      />
      <Row label={<Trans>Feed pages</Trans>} value={String(counts.feedPages)} />
      <Row
        label={<Trans>Unread listed</Trans>}
        value={String(counts.unreadListed)}
      />
      <Row
        label={<Trans>Publications</Trans>}
        value={String(counts.publications)}
      />
      <Row
        label={<Trans>Back-catalog pages</Trans>}
        value={String(counts.backCatalogPages)}
      />
      <Row label={<Trans>Authors</Trans>} value={String(counts.authors)} />
      <Row label={<Trans>Lists</Trans>} value={String(counts.lists)} />
      <Row
        label={<Trans>Articles</Trans>}
        value={`${counts.bodiesCached} of ${counts.bodiesQueued} queued`}
      />
      <Row label={<Trans>Images</Trans>} value={String(counts.imagesWarmed)} />
      <Row
        label={<Trans>Storage</Trans>}
        value={
          usage
            ? `${formatBytes(usage.usage)}${usage.quota ? ` of ${formatBytes(usage.quota)}` : ""}${usage.persisted ? " (persisted)" : ""}`
            : "unavailable"
        }
      />
      <div {...stylex.props(styles.actions)}>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={progress.running}
          onPress={() => void runOfflineSync(router, { force: true })}
        >
          <Trans>Run sync now</Trans>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={!progress.running}
          onPress={stopOfflineSync}
        >
          <Trans>Stop</Trans>
        </Button>
      </div>
    </div>
  );
}
