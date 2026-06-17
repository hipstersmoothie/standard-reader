"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import { articlePublicationUrl } from "#/components/reader/format";
import { buildBlueskyComposeUrl } from "#/lib/quote-share";
import { ExternalLink, Share2 } from "lucide-react";
import { mergeProps } from "react-aria";

import { MagHoverButton } from "./mag-hover-button";
import { useMagHover } from "./use-mag-hover";

function FeatureEndLink({ href }: { href: string }) {
  const { hoverProps, isHovered } = useMagHover();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="feature-end-link"
      {...mergeProps(hoverProps)}
      data-hovered={isHovered || undefined}
    >
      <span>Read more from the author</span>
      <ExternalLink size={14} aria-hidden />
    </a>
  );
}

export function MagazineFeatureEnd({ detail }: { detail: ArticleDetail }) {
  const publicationUrl = detail.publication?.url?.trim() || null;
  const shareUrl = articlePublicationUrl(detail);

  if (!publicationUrl && !shareUrl) return null;

  const onShare = () => {
    if (!shareUrl) return;
    globalThis.open(
      buildBlueskyComposeUrl(shareUrl),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <footer className="feature-end">
      <div className="feature-end-actions">
        {publicationUrl ? <FeatureEndLink href={publicationUrl} /> : null}
        {shareUrl ? (
          <MagHoverButton
            type="button"
            className="feature-end-share-btn"
            onClick={onShare}
          >
            <Share2 size={14} aria-hidden />
            <span>Share</span>
          </MagHoverButton>
        ) : null}
      </div>
    </footer>
  );
}
