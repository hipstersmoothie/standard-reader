"use client";

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
  fontWeight,
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
  heading: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.xs,
    marginTop: verticalSpace.none,
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

/** `/settings?debug` — the flag that shows this panel. */
function debugRequested(): boolean {
  if (globalThis.location === undefined) return false;
  return new URLSearchParams(globalThis.location.search).has("debug");
}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.key)}>{label}</span>
      <span {...stylex.props(styles.value)}>{value}</span>
    </div>
  );
}

/**
 * Live view of the offline sync pass, shown only when the settings URL carries
 * `?debug`. Untranslated on purpose, like the push diagnostics values: this is
 * a troubleshooting surface whose strings get read back verbatim.
 *
 * "Run sync now" bypasses the installed-app gate, which is what makes offline
 * sync exercisable in a browser tab at all — on a device it also answers "is
 * sync broken or merely not running".
 */
export function OfflineSyncDebugPanel() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const progress = useSyncExternalStore(
    subscribeOfflineSyncProgress,
    getOfflineSyncProgress,
    getOfflineSyncProgressServer,
  );
  const [usage, setUsage] = useState<OfflineStorageUsage | null>(null);

  // Client-only: the flag lives in the URL's search string, which the server
  // render must not depend on (and the settings route doesn't validate it).
  useEffect(() => {
    setVisible(debugRequested());
  }, []);

  // Refresh the storage line while a pass runs; it is the pass's output.
  useEffect(() => {
    void offlineStorageUsage().then(setUsage);
    if (!progress.running) return;
    const interval = globalThis.setInterval(() => {
      void offlineStorageUsage().then(setUsage);
    }, 3000);
    return () => globalThis.clearInterval(interval);
  }, [progress.running]);

  if (!visible) return null;

  const { counts } = progress;
  const status = progress.running
    ? `running (${progress.pass}) — ${progress.step ?? "…"}`
    : progress.stopReason
      ? `${progress.stopReason}${progress.error ? `: ${progress.error}` : ""}`
      : "not started";

  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.heading)}>Offline sync (debug)</p>
      <Row label="status" value={status} />
      <Row
        label="started / finished"
        value={`${stamp(progress.startedAt)} / ${stamp(progress.finishedAt)}`}
      />
      <Row label="feed pages" value={String(counts.feedPages)} />
      <Row label="unread listed" value={String(counts.unreadListed)} />
      <Row label="publications" value={String(counts.publications)} />
      <Row label="back-catalog pages" value={String(counts.backCatalogPages)} />
      <Row label="authors" value={String(counts.authors)} />
      <Row label="lists" value={String(counts.lists)} />
      <Row
        label="bodies"
        value={`${counts.bodiesCached} of ${counts.bodiesQueued} queued`}
      />
      <Row label="images" value={String(counts.imagesWarmed)} />
      <Row
        label="storage"
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
          Run sync now
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={!progress.running}
          onPress={stopOfflineSync}
        >
          Stop
        </Button>
      </div>
    </div>
  );
}
