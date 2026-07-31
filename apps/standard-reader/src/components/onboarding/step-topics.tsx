import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import { ToggleButton } from "@standard-reader/design-system/toggle-button";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";

const MAX_TOPICS = 5;
const TOPIC_LIMIT = 24;

const styles = stylex.create({
  chips: {
    columnGap: gap.md,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: gap.md,
  },
  chipCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginInlineStart: "0.35em",
  },
});

export function StepTopics({
  selected,
  onChange,
}: {
  selected: Array<string>;
  onChange: (next: Array<string>) => void;
}) {
  const topicsQuery = useQuery(
    discoverApi.getTopicsQueryOptions({ limit: TOPIC_LIMIT }),
  );
  const topics = topicsQuery.data ?? [];
  const selectedSet = new Set(selected);

  if (topicsQuery.isLoading) {
    return (
      <div {...stylex.props(styles.chips)}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangle"
            height="2.25rem"
            width={`${5 + ((i * 3) % 4)}rem`}
          />
        ))}
      </div>
    );
  }

  const toggle = (topic: string, next: boolean) => {
    if (next) {
      if (selectedSet.has(topic) || selected.length >= MAX_TOPICS) return;
      onChange([...selected, topic]);
    } else {
      onChange(selected.filter((t) => t !== topic));
    }
  };

  const atCap = selected.length >= MAX_TOPICS;

  return (
    <div {...stylex.props(styles.chips)}>
      {topics.map((topic) => {
        const isSelected = selectedSet.has(topic.topic);
        return (
          <ToggleButton
            key={topic.topic}
            variant="outline"
            isSelected={isSelected}
            isDisabled={atCap && !isSelected}
            onChange={(next) => toggle(topic.topic, next)}
          >
            {topic.topic}
            {topic.count > 0 ? (
              <span {...stylex.props(styles.chipCount)}>({topic.count})</span>
            ) : null}
          </ToggleButton>
        );
      })}
    </div>
  );
}
