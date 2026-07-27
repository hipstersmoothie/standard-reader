"use client";

import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";

import { formatReaders } from "#/components/reader/format";
import { useArticleRecommend } from "#/components/reader/use-article-recommend";
import { user } from "#/integrations/tanstack-query/api-user.functions";

import { MagHoverButton } from "./mag-hover-button";

export function MagazineEndLike({
  documentUri,
  recommendCount: initialRecommendCount,
}: {
  documentUri: string;
  recommendCount: number;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const { recommended, recommendCount, toggle, isPending } =
    useArticleRecommend(documentUri, signedIn, initialRecommendCount);

  return (
    <div className="endcard-like">
      <p className="endcard-like-dek">
        <Trans>Did you enjoy this issue?</Trans>
      </p>
      <MagHoverButton
        type="button"
        className={`endcard-like-btn${recommended ? " is-liked" : ""}`}
        aria-pressed={recommended}
        disabled={isPending}
        onClick={toggle}
      >
        <Heart
          className="endcard-like-heart"
          size={16}
          strokeWidth={2}
          fill={recommended ? "currentColor" : "none"}
        />
        <span>
          {recommended ? (
            <Trans>Recommended</Trans>
          ) : (
            <Trans>Recommend this issue</Trans>
          )}
        </span>
        <span className="endcard-like-divider" aria-hidden />
        <span className="endcard-like-count">
          {formatReaders(recommendCount)}
        </span>
      </MagHoverButton>
    </div>
  );
}
