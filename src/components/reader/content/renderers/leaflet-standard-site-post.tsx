"use client";

import type { LeafletStandardSitePostBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { documentLinkParams } from "#/components/reader/format";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";

import { articleBodyStyles } from "../body-styles";
import { StructuredWebsiteView } from "./structured-views";

export function LeafletStandardSitePostBlockView({
  block,
}: {
  block: LeafletStandardSitePostBlock;
}) {
  const uri = block.uri?.trim();
  const linkParams = uri ? documentLinkParams(uri) : null;

  const { data: article } = useQuery({
    ...publicationApi.getArticleQueryOptions(uri ?? ""),
    enabled: Boolean(uri),
    staleTime: 5 * 60 * 1000,
  });

  if (!uri) return null;

  const title = article?.title ?? "Article";
  const description = article?.description ?? undefined;
  const previewImage = article?.coverImageUrl ?? undefined;

  if (linkParams) {
    return (
      <Link
        to="/a/$did/$rkey"
        params={linkParams}
        {...stylex.props(articleBodyStyles.websiteCard)}
      >
        {previewImage ? (
          <img
            src={previewImage}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            {...stylex.props(articleBodyStyles.websiteCardImage)}
          />
        ) : null}
        <div {...stylex.props(articleBodyStyles.websiteCardBody)}>
          <p {...stylex.props(articleBodyStyles.websiteCardTitle)}>{title}</p>
          {description ? (
            <p {...stylex.props(articleBodyStyles.websiteCardDescription)}>
              {description}
            </p>
          ) : null}
        </div>
      </Link>
    );
  }

  return (
    <StructuredWebsiteView
      src={uri}
      title={title}
      description={description}
      previewImage={previewImage}
    />
  );
}
