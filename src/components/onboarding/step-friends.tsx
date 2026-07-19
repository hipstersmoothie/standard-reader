import { Plural, Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import type { FriendPublisher } from "#/integrations/tanstack-query/api-discover.functions";
import { ONBOARDING_FRIENDS_LIMIT } from "#/lib/onboarding";

import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { uiColor } from "../../design-system/theme/color.stylex";
import { verticalSpace } from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import {
  FriendPublisherGroup,
  FriendPublishersDegradedNote,
  FriendPublishersSkeleton,
} from "../reader/friend-publishers";
import { OnboardingPubRow } from "./onboarding-pub-row";

const styles = stylex.create({
  groups: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace["10xl"],
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
 * subscribe buttons on `/friends`.
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
    return <FriendPublishersSkeleton groups={2} />;
  }

  const people = data?.people ?? [];
  const remaining = Math.max(0, (data?.totalPeople ?? 0) - people.length);
  // The wizard skips this step when there's nobody, so an empty render here
  // only happens if the graph changed under us mid-flow.
  if (people.length === 0) {
    return (
      <Flex direction="column" gap="lg">
        {data?.degraded ? <FriendPublishersDegradedNote /> : null}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="lg">
      {data?.degraded ? <FriendPublishersDegradedNote /> : null}
      <div {...stylex.props(styles.groups)}>
        {people.map((person) => (
          <FriendPublisherGroup
            key={person.did}
            person={person}
            action={
              <SelectAllButton
                person={person}
                selected={selected}
                onToggle={onToggle}
              />
            }
          >
            {person.publications.map((pub) => (
              <OnboardingPubRow
                key={pub.uri}
                pub={pub}
                selected={selected.has(pub.uri)}
                onToggle={(next) => onToggle(pub.uri, next)}
              />
            ))}
          </FriendPublisherGroup>
        ))}
      </div>
      {remaining > 0 ? (
        <p {...stylex.props(styles.more)}>
          <Plural
            value={remaining}
            one="# more person you follow writes here — find them under Discover once you're set up."
            other="# more people you follow write here — find them under Discover once you're set up."
          />
        </p>
      ) : null}
    </Flex>
  );
}

/**
 * Person-level shortcut. People who run several publications are common enough
 * that "subscribe to all of Anna's writing" deserves one press; for a single
 * publication the row below already says everything, so the button is omitted.
 */
function SelectAllButton({
  person,
  selected,
  onToggle,
}: {
  person: FriendPublisher;
  selected: Set<string>;
  onToggle: (uri: string, next: boolean) => void;
}) {
  if (person.publications.length < 2) return null;

  const all = person.publications.every((pub) => selected.has(pub.uri));

  return (
    <Button
      variant={all ? "secondary" : "outline"}
      size="sm"
      onPress={() => {
        for (const pub of person.publications) onToggle(pub.uri, !all);
      }}
    >
      {all ? <Check size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
      {all ? <Trans>All selected</Trans> : <Trans>Select all</Trans>}
    </Button>
  );
}
