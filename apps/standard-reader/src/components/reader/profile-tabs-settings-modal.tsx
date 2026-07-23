import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import type { ProfileTabId } from "#/lib/profile-tabs";
import { PROFILE_TAB_LABELS } from "#/lib/profile-tabs";

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Switch } from "@standard-reader/design-system/switch";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";

const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: spacing["4"],
    justifyContent: "space-between",
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  rowLabel: {
    color: uiColor.text1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  empty: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
  },
});

export interface ProfileTabsSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tabs that currently have content, in display order. */
  candidateTabs: ReadonlyArray<ProfileTabId>;
  /** Subset of `candidateTabs` currently shown on the profile. */
  visibleTabs: ReadonlyArray<ProfileTabId>;
  onToggleTab: (tabId: ProfileTabId, visible: boolean) => void;
}

/**
 * Owner-only modal for choosing which content tabs appear on a public profile.
 * Presentational: state and persistence live in the profile route.
 */
export function ProfileTabsSettingsModal({
  isOpen,
  onOpenChange,
  candidateTabs,
  visibleTabs,
  onToggleTab,
}: ProfileTabsSettingsModalProps) {
  const { t } = useLingui();
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <Trans>Profile settings</Trans>
      </DialogHeader>
      <DialogDescription>
        <Trans>Choose which tabs appear on your public profile.</Trans>
      </DialogDescription>
      <DialogBody>
        {candidateTabs.length === 0 ? (
          <p {...stylex.props(styles.empty)}>
            <Trans>You don&apos;t have any content tabs to show yet.</Trans>
          </p>
        ) : (
          candidateTabs.map((tabId) => {
            const visible = visibleTabs.includes(tabId);
            const label = PROFILE_TAB_LABELS[tabId];
            return (
              <div key={tabId} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowLabel)}>{label}</span>
                <Switch
                  isSelected={visible}
                  onChange={(next) => onToggleTab(tabId, next)}
                  aria-label={t`Show ${label} tab`}
                />
              </div>
            );
          })
        )}
      </DialogBody>
    </Dialog>
  );
}
