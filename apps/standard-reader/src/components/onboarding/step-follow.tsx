import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import type { OnboardingSuggestionSection } from "#/integrations/tanstack-query/api-discover.functions";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";

import { Flex } from "@standard-reader/design-system/flex";
import { primaryColor, uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { Body } from "@standard-reader/design-system/typography";
import { PubCardSkeleton } from "../reader/cards";
import { OnboardingPubRow } from "./onboarding-pub-row";

const styles = stylex.create({
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    marginBottom: verticalSpace.md,
    textTransform: "uppercase",
  },
  rows: {
    borderColor: uiColor.border1,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
});

function sectionTitle(section: OnboardingSuggestionSection): string {
  switch (section.kind) {
    case "trending": {
      return "Trending this week";
    }
    case "topic": {
      return `Popular in ${section.topic ?? "your topics"}`;
    }
    default: {
      return "Popular on the network";
    }
  }
}

export function StepFollow({
  topics,
  selected,
  onToggle,
}: {
  topics: Array<string>;
  selected: Set<string>;
  onToggle: (uri: string, next: boolean) => void;
}) {
  const query = useQuery(
    discoverApi.getOnboardingSuggestionsQueryOptions({ topics, limit: 18 }),
  );

  if (query.isLoading) {
    return (
      <Flex direction="column" gap="lg">
        {Array.from({ length: 5 }).map((_, i) => (
          <PubCardSkeleton key={i} />
        ))}
      </Flex>
    );
  }

  const sections = query.data?.sections ?? [];
  const trendingUris = new Set(query.data?.trendingUris ?? []);

  if (sections.length === 0) {
    return (
      <Body variant="secondary">
        No suggestions right now — you can find publications any time from
        Discover.
      </Body>
    );
  }

  return (
    <Flex direction="column" gap="5xl">
      {sections.map((section, i) => (
        <div key={`${section.kind}-${section.topic ?? i}`}>
          <h2 {...stylex.props(styles.sectionHeading)}>
            {sectionTitle(section)}
          </h2>
          <div {...stylex.props(styles.rows)}>
            {section.items.map((pub) => (
              <OnboardingPubRow
                key={pub.uri}
                pub={pub}
                trending={trendingUris.has(pub.uri)}
                selected={selected.has(pub.uri)}
                onToggle={(next) => onToggle(pub.uri, next)}
              />
            ))}
          </div>
        </div>
      ))}
    </Flex>
  );
}
