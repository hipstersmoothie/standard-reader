import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { weeklyApi } from "#/integrations/tanstack-query/api-weekly.functions";

/** `/weekly` → the newest week's hottest reads. */
export const Route = createFileRoute("/_layout/weekly/")({
  loader: async () => {
    const week = await weeklyApi.getLatestWeek();
    if (!week) throw notFound();
    throw redirect({ to: "/weekly/$week", params: { week } });
  },
});
