import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import type { OnboardingStep } from "#/components/onboarding/welcome-wizard";
import { WelcomeWizard } from "#/components/onboarding/welcome-wizard";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { ONBOARDING_FRIENDS_LIMIT } from "#/lib/onboarding";
import { siteSocialMeta } from "#/lib/site-metadata";

const searchSchema = z.object({
  step: z
    .enum(["intro", "topics", "friends", "follow", "settings", "done"])
    .optional(),
  topics: z.array(z.string().min(1).max(60)).max(5).optional(),
});

export const Route = createFileRoute("/welcome")({
  validateSearch: searchSchema,
  // Guard the wizard: signed-out visitors go to login (and return here after);
  // readers who already finished onboarding go Home. A signed-in reader who
  // hasn't completed onboarding is allowed even if they already follow things —
  // it's skippable and suggestions exclude their existing follows.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({ to: "/login", search: { redirect: "/welcome" } });
    }
    if (session.onboardingCompleted) {
      throw redirect({ to: "/" });
    }
  },
  loader: async ({ context }) => {
    // Warm the step data so each step paints without a spinner.
    void context.queryClient.prefetchQuery(
      discoverApi.getTopicsQueryOptions({ limit: 24 }),
    );
    void context.queryClient.prefetchQuery(
      discoverApi.getKnownPublicationCountQueryOptions(),
    );
    void context.queryClient.prefetchQuery(
      discoverApi.getTrendingPublicationsQueryOptions({ limit: 6 }),
    );
    // Kicked off at the intro step: the Bluesky lookup decides whether the
    // "people you follow" step exists at all, so it needs a head start.
    void context.queryClient.prefetchQuery(
      discoverApi.getFriendPublishersQueryOptions({
        limit: ONBOARDING_FRIENDS_LIMIT,
      }),
    );
    await Promise.all([
      context.queryClient.ensureQueryData(user.getThemePreferenceQueryOptions),
      context.queryClient.ensureQueryData(
        user.getReadingTypographyPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getTrackReadingHistoryPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getCountOldPostsAsUnreadPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getOpenLinksPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getReaderVoicePreferenceQueryOptions,
      ),
    ]);
  },
  head: () => ({
    meta: siteSocialMeta({
      title: "Welcome · Standard Reader",
      description: "Set up your reading feed.",
    }),
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { step = "intro", topics = [] } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setStep = (next: OnboardingStep) => {
    void navigate({ search: (prev) => ({ ...prev, step: next }) });
  };
  const setTopics = (next: Array<string>) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        topics: next.length > 0 ? next : undefined,
      }),
    });
  };

  return (
    <WelcomeWizard
      step={step}
      topics={topics}
      onStepChange={setStep}
      onTopicsChange={setTopics}
    />
  );
}
