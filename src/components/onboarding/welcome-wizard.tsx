import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { ONBOARDING_FRIENDS_LIMIT } from "#/lib/onboarding";

import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import {
  primaryColor,
  successColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { breakpoints } from "../../design-system/theme/media-queries.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "../../design-system/theme/typography.stylex";
import { toasts } from "../../design-system/toast";
import { Body } from "../../design-system/typography";
import { Text } from "../../design-system/typography/text";
import { BrandWordmark } from "../reader/brand-wordmark";
import { StepFollow } from "./step-follow";
import { StepFriends } from "./step-friends";
import { StepIntro } from "./step-intro";
import { StepSettings } from "./step-settings";
import { StepTopics } from "./step-topics";

export type OnboardingStep =
  | "intro"
  | "topics"
  | "friends"
  | "follow"
  | "settings"
  | "done";

/** Ordered steps that count toward the progress dots (intro excluded). */
const PROGRESS_STEPS: Array<OnboardingStep> = [
  "topics",
  "friends",
  "follow",
  "settings",
  "done",
];

const MIN_FOLLOWS = 3;

type SessionData = Awaited<ReturnType<typeof user.getSession>>;

const styles = stylex.create({
  center: {
    textAlign: "center",
  },
  // Keep the Skip button's box on the final step (invisible) so the header
  // height stays constant and the wordmark doesn't shift between steps.
  skipHidden: {
    visibility: "hidden",
  },
  main: {
    backgroundColor: primaryColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    position: "relative",
  },
  header: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  scroll: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    overflowY: "auto",
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
  },
  column: {
    // `marginBlock: auto` centers the step vertically when it's shorter than
    // the viewport, and collapses to allow normal scrolling when it's taller.
    marginBottom: "auto",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    marginTop: "auto",
    paddingBottom: verticalSpace["5xl"],
    paddingTop: verticalSpace["5xl"],
    width: {
      default: "100%",
      [breakpoints.sm]: "min(92vw, 560px)",
    },
  },
  stepHeading: {
    display: "flex",
    flexDirection: "column",
    marginBottom: verticalSpace["5xl"],
    rowGap: verticalSpace["2xl"],
    textAlign: "center",
  },
  footer: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace.xl,
    rowGap: verticalSpace.lg,
    width: {
      default: "100%",
      [breakpoints.sm]: "min(92vw, 560px)",
    },
  },
  footerRow: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    justifyContent: "space-between",
  },
  counter: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  counterReady: {
    color: successColor.text2,
    fontWeight: fontWeight.medium,
  },
  dotsBar: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    paddingBottom: `calc(${verticalSpace["3xl"]} + env(safe-area-inset-bottom))`,
    paddingTop: verticalSpace["3xl"],
  },
  dot: {
    backgroundColor: uiColor.border2,
    borderRadius: radius.full,
    height: 7,
    width: 7,
  },
  dotActive: {
    backgroundColor: primaryColor.solid1,
    width: 20,
  },
  dotDone: {
    backgroundColor: primaryColor.border3,
  },
});

const STEP_COPY: Record<
  Exclude<OnboardingStep, "intro" | "done">,
  { title: MessageDescriptor; dek: MessageDescriptor }
> = {
  topics: {
    title: msg`What do you like to read?`,
    dek: msg`Pick a few topics — we'll suggest publications to match. Optional.`,
  },
  friends: {
    title: msg`People you follow write here`,
    dek: msg`These accounts you follow on Bluesky publish on standard.site. Subscribing puts their writing on your Home feed.`,
  },
  follow: {
    title: msg`Subscribe to a few publications`,
    dek: msg`Your Home feed is built from subscriptions. Three is a good start.`,
  },
  settings: {
    title: msg`A few preferences`,
    dek: msg`Set these now, or change them any time in Settings.`,
  },
};

export function WelcomeWizard({
  step,
  topics,
  onStepChange,
  onTopicsChange,
}: {
  step: OnboardingStep;
  topics: Array<string>;
  onStepChange: (next: OnboardingStep) => void;
  onTopicsChange: (next: Array<string>) => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const finishMutation = useMutation({
    mutationFn: async () => user.setOnboardingCompleted(),
    onSuccess: () => {
      // Patch the session cache in place so the Home gate sees completion
      // without a full session refetch (which re-restores the PDS client).
      queryClient.setQueryData<SessionData>(
        user.getSessionQueryOptions.queryKey,
        (prev) => (prev ? { ...prev, onboardingCompleted: true } : prev),
      );
      // Surface the new follows in the sidebar + populate Home.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === "feed",
      });
    },
  });

  const followMutation = useMutation({
    mutationFn: async (uris: Array<string>) =>
      readerApi.followPublications({ data: { publicationUris: uris } }),
  });

  const toggleFollow = useCallback((uri: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(uri);
      else copy.delete(uri);
      return copy;
    });
  }, []);

  // Follows are committed once, at the end. Keeping them as in-memory selection
  // until then means back/forward preserves the picks (and the suggestion list
  // doesn't drop rows as "already followed" mid-wizard).
  const finishAndGoHome = useCallback(async () => {
    const uris = [...selected];
    if (uris.length > 0) {
      try {
        const { results } = await followMutation.mutateAsync(uris);
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          toasts.add(
            {
              variant: "warning",
              title: t`${plural(failed.length, {
                one: "Couldn't follow # publication",
                other: "Couldn't follow # publications",
              })}`,
              description: t`You can add them later from Discover.`,
            },
            { timeout: 5000 },
          );
        }
      } catch {
        toasts.add(
          {
            variant: "critical",
            title: t`Couldn't save your follows`,
            description: t`You can subscribe to publications from Discover.`,
          },
          { timeout: 5000 },
        );
      }
    }
    await finishMutation.mutateAsync();
    await navigate({ to: "/" });
  }, [selected, followMutation, finishMutation, navigate, t]);

  // Whether the reader follows anyone on Bluesky who publishes here. Prefetched
  // by the /welcome loader, so this has usually resolved by the intro step.
  const { data: friends, isPending: friendsPending } = useQuery(
    discoverApi.getFriendPublishersQueryOptions({
      limit: ONBOARDING_FRIENDS_LIMIT,
    }),
  );
  const hasFriends = (friends?.publicationCount ?? 0) > 0;
  // A dedicated step that renders nobody is a dead screen, so it only exists
  // when it has content. While the lookup is still in flight we keep the step
  // in the flow rather than dropping a dot mid-wizard.
  const includeFriends = hasFriends || friendsPending;
  const progressSteps = includeFriends
    ? PROGRESS_STEPS
    : PROGRESS_STEPS.filter((s) => s !== "friends");

  // Landing on ?step=friends with nothing to show (deep link, or the lookup
  // resolved empty while the reader was on it) moves on instead of stranding.
  useEffect(() => {
    if (step === "friends" && !friendsPending && !hasFriends) {
      onStepChange("follow");
    }
  }, [step, friendsPending, hasFriends, onStepChange]);

  const progressIndex = progressSteps.indexOf(step);

  // Reset the scroll position whenever the step changes so each step starts at
  // the top rather than inheriting the previous step's scroll offset.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const backTarget: Record<OnboardingStep, OnboardingStep | null> = {
    intro: null,
    topics: "intro",
    friends: "topics",
    follow: includeFriends ? "friends" : "topics",
    settings: "follow",
    done: "settings",
  };

  const forward = () => {
    switch (step) {
      case "intro": {
        onStepChange("topics");
        break;
      }
      case "topics": {
        onStepChange(includeFriends ? "friends" : "follow");
        break;
      }
      case "friends": {
        onStepChange("follow");
        break;
      }
      case "follow": {
        onStepChange("settings");
        break;
      }
      case "settings": {
        onStepChange("done");
        break;
      }
      case "done": {
        void finishAndGoHome();
        break;
      }
    }
  };

  const forwardLabel =
    step === "intro"
      ? t`Get started`
      : step === "topics"
        ? t`Continue`
        : step === "friends" || step === "follow"
          ? selected.size === 0
            ? t`Skip for now`
            : t`Continue`
          : step === "settings"
            ? t`Finish`
            : t`Start reading`;

  const forwardPending =
    step === "done" && (followMutation.isPending || finishMutation.isPending);

  const back = backTarget[step];
  const selectedCount = selected.size;
  const remainingFollows = MIN_FOLLOWS - selectedCount;

  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.header)}>
        <BrandWordmark />
        <Button
          variant="tertiary"
          size="sm"
          onPress={() => void finishAndGoHome()}
          isDisabled={
            step === "done" ||
            finishMutation.isPending ||
            followMutation.isPending
          }
          style={step === "done" ? styles.skipHidden : undefined}
        >
          <Trans>Skip for now</Trans>
        </Button>
      </div>

      <div ref={scrollRef} {...stylex.props(styles.scroll)}>
        <div {...stylex.props(styles.column)}>
          {step === "intro" ? <StepIntro /> : null}

          {step === "topics" ? (
            <>
              <StepHeadingBlock stepKey="topics" />
              <StepTopics selected={topics} onChange={onTopicsChange} />
            </>
          ) : null}

          {step === "friends" ? (
            <>
              <StepHeadingBlock stepKey="friends" />
              <StepFriends selected={selected} onToggle={toggleFollow} />
            </>
          ) : null}

          {step === "follow" ? (
            <>
              <StepHeadingBlock stepKey="follow" />
              <StepFollow
                topics={topics}
                selected={selected}
                onToggle={toggleFollow}
              />
            </>
          ) : null}

          {step === "settings" ? (
            <>
              <StepHeadingBlock stepKey="settings" />
              <StepSettings />
            </>
          ) : null}

          {step === "done" ? (
            <Flex direction="column" align="center" gap="5xl">
              <Text font="title" size="3xl" weight="bold">
                <Trans>Your feed is ready</Trans>
              </Text>
              <Body variant="secondary" style={styles.center}>
                {selected.size > 0 ? (
                  <Plural
                    value={selected.size}
                    one="You're following # publication. Their latest writing will collect on Home."
                    other="You're following # publications. Their latest writing will collect on Home."
                  />
                ) : (
                  <Trans>
                    Your Home feed is empty for now — head to Discover whenever
                    you're ready, and everything you subscribe to will start
                    collecting here.
                  </Trans>
                )}
              </Body>
            </Flex>
          ) : null}
        </div>
      </div>

      <div {...stylex.props(styles.footer)}>
        {step === "friends" || step === "follow" ? (
          <span
            {...stylex.props(
              styles.counter,
              selected.size >= MIN_FOLLOWS && styles.counterReady,
            )}
          >
            {selected.size === 0 ? (
              <Trans>Follow at least {MIN_FOLLOWS} to fill your feed</Trans>
            ) : selected.size < MIN_FOLLOWS ? (
              <Trans>
                {selectedCount} selected — {remainingFollows} more to fill your
                feed
              </Trans>
            ) : (
              <Trans>{selectedCount} selected</Trans>
            )}
          </span>
        ) : null}
        <div {...stylex.props(styles.footerRow)}>
          <Button
            variant="tertiary"
            isDisabled={back == null}
            onPress={() => back && onStepChange(back)}
          >
            <Trans>Back</Trans>
          </Button>
          <Button
            variant={
              (step === "friends" || step === "follow") && selected.size === 0
                ? "outline"
                : "primary"
            }
            isPending={forwardPending}
            onPress={forward}
          >
            {forwardLabel}
          </Button>
        </div>
      </div>

      <div {...stylex.props(styles.dotsBar)} aria-hidden>
        {progressSteps.map((s, i) => (
          <span
            key={s}
            {...stylex.props(
              styles.dot,
              progressIndex === i && styles.dotActive,
              progressIndex > i && styles.dotDone,
            )}
          />
        ))}
      </div>
    </main>
  );
}

function StepHeadingBlock({
  stepKey,
}: {
  stepKey: Exclude<OnboardingStep, "intro" | "done">;
}) {
  const { i18n } = useLingui();
  const copy = STEP_COPY[stepKey];
  return (
    <div {...stylex.props(styles.stepHeading)}>
      <Text font="title" size="3xl" weight="bold">
        {i18n._(copy.title)}
      </Text>
      <Body variant="secondary">{i18n._(copy.dek)}</Body>
    </div>
  );
}
