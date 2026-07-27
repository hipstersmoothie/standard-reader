import { Plural, Trans } from "@lingui/react/macro";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { Body } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";

import { PublicationAvatar } from "../reader/primitives";

const styles = stylex.create({
  center: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace["3xl"],
    textAlign: "center",
  },
  kicker: {
    color: primaryColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  dek: {
    maxWidth: "40ch",
  },
  stat: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  cluster: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  },
  clusterItem: {
    marginInlineStart: "-0.6rem",
    borderColor: primaryColor.bgSubtle,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: 2,
  },
});

export function StepIntro() {
  const countQuery = useQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );
  const trendingQuery = useQuery(
    discoverApi.getTrendingPublicationsQueryOptions({ limit: 6 }),
  );
  const count = countQuery.data ?? null;
  const cluster = (trendingQuery.data ?? []).slice(0, 6);
  const formattedCount = count == null ? "" : count.toLocaleString();

  return (
    <div {...stylex.props(styles.center)}>
      <span {...stylex.props(styles.kicker)}>
        <Trans>Welcome to</Trans>
      </span>
      <Text font="title" size="4xl" weight="bold">
        Standard Reader
      </Text>
      <Body variant="secondary" style={styles.dek}>
        <Trans>
          A calm reading room for the open web. Let&apos;s take two minutes to
          make it yours.
        </Trans>
      </Body>

      {cluster.length > 0 ? (
        <div {...stylex.props(styles.cluster)}>
          {cluster.map((pub) => (
            <span key={pub.uri} {...stylex.props(styles.clusterItem)}>
              <PublicationAvatar pub={pub} size="md" />
            </span>
          ))}
        </div>
      ) : null}

      {count == null ? null : (
        <span {...stylex.props(styles.stat)}>
          <Plural
            value={count}
            one={`${formattedCount} publication across the Atmosphere`}
            other={`${formattedCount} publications across the Atmosphere`}
          />
        </span>
      )}
    </div>
  );
}
