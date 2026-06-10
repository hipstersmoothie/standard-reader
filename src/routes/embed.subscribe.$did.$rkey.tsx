import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { publicationUriFromParams } from "#/components/reader/format";
import { SubscribeCard } from "#/components/reader/subscribe-card";
import { SubscribeEmbedResizeReporter } from "#/components/reader/subscribe-embed-resize";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { publicationThemeColors } from "#/components/reader/subscribe-card";
import {
  subscribeEmbedPageBackgroundCss,
  subscribePageUrl,
} from "#/lib/publication-embed";

const embedSubscribeSearchSchema = z.object({
  layout: z.enum(["portrait"]).optional(),
});

const styles = stylex.create({
  shell: {
    display: "block",
    margin: 0,
    padding: 0,
    width: "100%",
  },
});

export const Route = createFileRoute("/embed/subscribe/$did/$rkey")({
  ssr: false,
  validateSearch: embedSubscribeSearchSchema,
  loader: async ({ context, params }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const meta = await context.queryClient.ensureQueryData(
      publicationApi.getPublicationEmbedMetaQueryOptions(uri),
    );
    if (!meta) {
      throw notFound();
    }
    return { meta };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    const name = meta?.name;
    const background = meta
      ? publicationThemeColors(meta).background
      : "#f9f7f2";
    return {
      meta: [
        { title: name ? `Subscribe to ${name}` : "Subscribe" },
        { name: "robots", content: "noindex" },
      ],
      styles: [
        {
          type: "text/css",
          children: subscribeEmbedPageBackgroundCss(background),
        },
      ],
    };
  },
  component: EmbedSubscribePage,
});

function EmbedSubscribePage() {
  const { did, rkey } = Route.useParams();
  const { layout: layoutSearch } = Route.useSearch();
  const { meta } = Route.useLoaderData();
  const layout = layoutSearch === "portrait" ? "portrait" : "landscape";
  useSuspenseQuery(
    publicationApi.getPublicationEmbedMetaQueryOptions(meta.uri),
  );

  const subscribeHref = subscribePageUrl({
    did,
    rkey,
    baseUrl: getPublicUrlClient(),
  });
  const colors = publicationThemeColors(meta);
  const pageBackgroundCss = subscribeEmbedPageBackgroundCss(colors.background);

  return (
    <>
      <main
        {...stylex.props(styles.shell)}
        data-subscribe-embed
        style={{ backgroundColor: colors.background }}
      >
        <SubscribeEmbedResizeReporter />
        <SubscribeCard
          meta={meta}
          phase="embed"
          subscribeHref={subscribeHref}
          layout={layout}
        />
      </main>
      <style>{pageBackgroundCss}</style>
    </>
  );
}
