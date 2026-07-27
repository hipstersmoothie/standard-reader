import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { LabelerDetailView } from "../components/labeler-detail-view";

const labelerSearchSchema = z.object({
  view: z.enum(["labels", "documents"]).default("labels"),
});

export const Route = createFileRoute("/_layout/labelers/$did")({
  validateSearch: labelerSearchSchema,
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: buildAuthRedirectPath(`/labelers/${params.did}`),
        },
      });
    }
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      labelerApi.getLabelerQueryOptions(params.did),
    );
    void context.queryClient.prefetchInfiniteQuery(
      labelerApi.getLabeledDocumentsInfiniteQueryOptions(params.did),
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: LabelerDetailPage,
});

function LabelerDetailPage() {
  const { did } = Route.useParams();
  const { view } = Route.useSearch();
  return <LabelerDetailView did={did} view={view} />;
}
