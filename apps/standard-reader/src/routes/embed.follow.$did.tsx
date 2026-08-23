import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { EmbedResizeReporter } from "#/components/reader/embed-resize";
import { FollowCard } from "#/components/reader/follow-card";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { followEmbedColors, followPageUrl } from "#/lib/author-embed";
import { embedPageBackgroundCss } from "#/lib/embed-snippet";
import { getPublicUrlClient } from "#/lib/public-url";

const embedFollowSearchSchema = z.object({
  layout: z.enum(["portrait"]).optional(),
});

const styles = stylex.create({
  shell: {
    margin: 0,
    padding: 0,
    display: "block",
    width: "100%",
  },
});

export const Route = createFileRoute("/embed/follow/$did")({
  ssr: false,
  validateSearch: embedFollowSearchSchema,
  loader: async ({ context, params }) => {
    const meta = await context.queryClient.ensureQueryData(
      authorApi.getAuthorEmbedMetaQueryOptions(params.did),
    );
    if (!meta) {
      throw notFound();
    }
    return { meta };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    const name = meta?.displayName ?? meta?.handle ?? null;
    return {
      meta: [
        { title: name ? `Follow ${name}` : "Follow" },
        { name: "robots", content: "noindex" },
      ],
      styles: [
        {
          type: "text/css",
          children: embedPageBackgroundCss(followEmbedColors().background),
        },
      ],
    };
  },
  component: EmbedFollowPage,
});

function EmbedFollowPage() {
  const { layout: layoutSearch } = Route.useSearch();
  const { meta } = Route.useLoaderData();
  const layout = layoutSearch === "portrait" ? "portrait" : "landscape";
  useSuspenseQuery(authorApi.getAuthorEmbedMetaQueryOptions(meta.did));

  // Keyed by the resolved DID, not the route param: the snippet may have been
  // generated from a handle, and handles change.
  const followHref = followPageUrl({
    did: meta.did,
    baseUrl: getPublicUrlClient(),
  });
  const colors = followEmbedColors();
  const pageBackgroundCss = embedPageBackgroundCss(colors.background);

  return (
    <>
      <main
        {...stylex.props(styles.shell)}
        data-embed-card
        style={{ backgroundColor: colors.background }}
      >
        <EmbedResizeReporter kind="follow" />
        <FollowCard
          meta={meta}
          phase="embed"
          followHref={followHref}
          layout={layout}
        />
      </main>
      <style>{pageBackgroundCss}</style>
    </>
  );
}
