import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { Separator } from "@standard-reader/design-system/separator";
import { Switch } from "@standard-reader/design-system/switch";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
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
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { Tooltip } from "@standard-reader/design-system/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Pressable } from "react-aria";

import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCountOldPostsAsUnread } from "#/lib/use-count-old-posts-as-unread";
import { useOpenLinks } from "#/lib/use-open-links";
import { usePublicationThemePreference } from "#/lib/use-publication-theme-preference";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

const MOBILE = "@media (max-width: 47.5rem)";

const styles = stylex.create({
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    marginBottom: verticalSpace.md,
  },
  group: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  row: {
    alignItems: {
      [MOBILE]: "stretch",
      default: "center",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      [MOBILE]: "column",
      default: "row",
    },
    justifyContent: "space-between",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.lg,
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  label: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.xs,
    marginTop: 0,
  },
  description: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: 0,
    marginTop: 0,
    maxWidth: "42ch",
  },
  control: {
    flexShrink: 0,
    width: { [MOBILE]: "100%", default: "auto" },
  },
});

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <div>
        <p {...stylex.props(styles.label)}>{label}</p>
        {description ? (
          <p {...stylex.props(styles.description)}>{description}</p>
        ) : null}
      </div>
      <div {...stylex.props(styles.control)}>{children}</div>
    </div>
  );
}

export function StepSettings() {
  const { t } = useLingui();
  const { openExternally, setOpenExternally } = useOpenLinks();
  const { enabled: trackReading, setEnabled: setTrackReading } =
    useTrackReadingHistory();
  const { enabled: countOldAsUnread, setEnabled: setCountOldAsUnread } =
    useCountOldPostsAsUnread();
  const { enabled: usePublicationTheme, setEnabled: setUsePublicationTheme } =
    usePublicationThemePreference();

  const digestStatusQuery = useQuery(user.getWeeklyDigestStatusQueryOptions);
  const digestEnabled = Boolean(
    digestStatusQuery.data?.enabled && digestStatusQuery.data?.hasEmailScope,
  );

  return (
    <Flex direction="column" gap="6xl">
      <div>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Reading &amp; privacy</Trans>
        </h2>
        <div {...stylex.props(styles.group)}>
          <Row
            label={t`Keep reading history`}
            description={t`Marks what you've read for unread counts. Stored publicly on your account — turn off to read privately.`}
          >
            <Switch
              isSelected={trackReading}
              onChange={setTrackReading}
              aria-label={t`Keep reading history`}
            />
          </Row>
          <Separator />
          <Row
            label={t`Open posts on their original site`}
            description={t`When on, links open on the original website instead of the in-app reader.`}
          >
            <Switch
              isSelected={openExternally}
              onChange={setOpenExternally}
              aria-label={t`Open posts on their original site`}
            />
          </Row>
          <Separator />
          <Row
            label={t`Mark old posts as unread`}
            description={t`When on, a publication's whole back catalogue counts as unread when you subscribe. Turn off to only see posts published after you subscribe as new.`}
          >
            <Switch
              isSelected={countOldAsUnread}
              onChange={setCountOldAsUnread}
              aria-label={t`Mark old posts as unread`}
            />
          </Row>
          <Separator />
          <Row
            label={t`Use publication themes`}
            description={t`When on, a publication's page and its posts are shown in that publication's own colors and fonts. Publications that haven't set any keep the Standard Reader theme.`}
          >
            <Switch
              isSelected={usePublicationTheme}
              onChange={setUsePublicationTheme}
              aria-label={t`Use publication themes`}
            />
          </Row>
        </div>
      </div>

      <div>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Weekly digest</Trans>
        </h2>
        <div {...stylex.props(styles.group)}>
          <Row
            label={t`Weekly digest email`}
            description={t`A weekly email with the best of what you subscribe to, plus a couple of publications worth discovering.`}
          >
            <Tooltip text={t`Coming soon`}>
              <Pressable>
                <div {...stylex.props(styles.control)}>
                  <Switch
                    isSelected={digestEnabled}
                    isDisabled
                    aria-label={t`Weekly digest email`}
                  />
                </div>
              </Pressable>
            </Tooltip>
          </Row>
        </div>
      </div>
    </Flex>
  );
}
