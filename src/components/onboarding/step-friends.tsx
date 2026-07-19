import { Plural } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { ONBOARDING_FRIENDS_LIMIT } from "#/lib/onboarding";

import { Flex } from "../../design-system/flex";
import { uiColor } from "../../design-system/theme/color.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import { PubCardSkeleton } from "../reader/cards";
import { FriendPublishersDegradedNote } from "../reader/friend-publishers";
import { OnboardingPubRow } from "./onboarding-pub-row";

const styles = stylex.create({
  // The same bordered row stack the trending / topic sections use, so every
  // step of the wizard reads as one list rather than three treatments.
  rows: {
    borderColor: uiColor.border1,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  more: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
});

/**
 * Onboarding step: publications written by the people the reader follows on
 * Bluesky — the strongest signal available at first run, so it comes before the
 * topic and trending suggestions.
 *
 * Selection is in-memory (committed with the rest of the wizard's picks at the
 * end), which is why this uses {@link OnboardingPubRow} rather than the live
 * subscribe buttons on `/friends`. Each row names its author, so the list needs
 * no per-person grouping.
 */
export function StepFriends({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (uri: string, next: boolean) => void;
}) {
  const { data, isPending } = useQuery(
    discoverApi.getFriendPublishersQueryOptions({
      limit: ONBOARDING_FRIENDS_LIMIT,
    }),
  );

  if (isPending) {
    return (
      <Flex direction="column" gap="lg">
        {Array.from({ length: 4 }, (_, index) => (
          <PubCardSkeleton key={index} />
        ))}
      </Flex>
    );
  }

  const publications = data?.publications ?? [];
  const remaining = Math.max(
    0,
    (data?.publicationCount ?? 0) - publications.length,
  );

  // The wizard skips this step when there's nothing to show, so an empty render
  // here only happens if the graph changed under us mid-flow.
  if (publications.length === 0) {
    return (
      <Flex direction="column" gap="lg">
        {data?.degraded ? <FriendPublishersDegradedNote /> : null}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="lg">
      {data?.degraded ? <FriendPublishersDegradedNote /> : null}
      <div {...stylex.props(styles.rows)}>
        {publications.map((pub) => (
          <OnboardingPubRow
            key={pub.uri}
            pub={pub}
            selected={selected.has(pub.uri)}
            onToggle={(next) => onToggle(pub.uri, next)}
          />
        ))}
      </div>
      {remaining > 0 ? (
        <p {...stylex.props(styles.more)}>
          <Plural
            value={remaining}
            one="# more publication from people you follow — find it under Discover once you're set up."
            other="# more publications from people you follow — find them under Discover once you're set up."
          />
        </p>
      ) : null}
    </Flex>
  );
}
