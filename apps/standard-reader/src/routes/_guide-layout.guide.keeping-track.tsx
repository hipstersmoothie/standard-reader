import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { KeepingTrackGuidePage } from "../components/guide/pages/keeping-track-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/keeping-track")({
  head: () => ({
    meta: pageSocialMeta("guideKeepingTrack", getPublicUrlClient()),
  }),
  component: KeepingTrackGuidePage,
});
