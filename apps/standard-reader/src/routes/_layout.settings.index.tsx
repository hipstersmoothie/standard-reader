import { createFileRoute, redirect } from "@tanstack/react-router";

import { googleFontsApi } from "#/integrations/tanstack-query/api-google-fonts.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { UserSettingsView } from "../components/user-settings-view";

export const Route = createFileRoute("/_layout/settings/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/settings") },
      });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        user.getReadingTypographyPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getReaderVoicePreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getOpenLinksPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getOpenCollectionsInMagazinePreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getTrackReadingHistoryPreferenceQueryOptions,
      ),
      context.queryClient.ensureQueryData(
        user.getCountOldPostsAsUnreadPreferenceQueryOptions,
      ),
      context.queryClient.prefetchQuery(
        googleFontsApi.getGoogleFontFamiliesQueryOptions,
      ),
    ]);
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return <UserSettingsView />;
}
