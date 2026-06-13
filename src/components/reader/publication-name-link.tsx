"use client";

import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { AppLink } from "#/components/reader/app-link";
import { publicationLinkParams } from "#/components/reader/format";
import { parseInternalRoute } from "#/lib/internal-route";

const styles = stylex.create({
  link: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
});

function publicationPagePath(uri: string): string | null {
  const params = publicationLinkParams(uri);
  if (!params) return null;
  return `/p/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}

type PublicationNameLinkProps = {
  publicationUri?: string | null;
  /** Fallback when the AT-URI cannot be parsed to `/p/$did/$rkey`. */
  url?: string | null;
  children: React.ReactNode;
  linkStyle?:
    | stylex.StyleXStyles
    | Array<stylex.StyleXStyles | false | undefined>;
  /**
   * Use a focusable span + client navigation instead of `<a>`. Required when
   * nested inside another link (e.g. article card eyebrows on `/`).
   */
  nested?: boolean;
  onClick?: (event: React.SyntheticEvent<HTMLElement>) => void;
};

/**
 * Link to `/p/$did/$rkey`. Uses client navigation when possible;
 * `stopPropagation` keeps nested article cards from opening the article.
 */
export function PublicationNameLink({
  publicationUri,
  url,
  children,
  linkStyle,
  nested = false,
  onClick,
}: PublicationNameLinkProps) {
  const navigate = useNavigate();
  const params =
    publicationUri == null ? null : publicationLinkParams(publicationUri);
  const href =
    params && publicationUri ? publicationPagePath(publicationUri) : null;

  const mergedStyle = stylex.props(
    styles.link,
    ...(linkStyle ? (Array.isArray(linkStyle) ? linkStyle : [linkStyle]) : []),
  );

  const stopBubble = (event: React.SyntheticEvent<HTMLElement>) => {
    event.stopPropagation();
    onClick?.(event);
  };

  const goToPublication = () => {
    if (!params) return;
    void navigate({ to: "/p/$did/$rkey", params });
  };

  if (params && href) {
    if (nested) {
      return (
        <span
          // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- nested inside parent card link
          role="link"
          tabIndex={0}
          onClick={(event) => {
            stopBubble(event);
            if (
              !event.defaultPrevented &&
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              goToPublication();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              stopBubble(event);
              goToPublication();
            }
          }}
          {...mergedStyle}
        >
          {children}
        </span>
      );
    }

    return (
      <a
        href={href}
        onClick={(event) => {
          stopBubble(event);
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          goToPublication();
        }}
        {...mergedStyle}
      >
        {children}
      </a>
    );
  }

  if (url) {
    const internal = parseInternalRoute(url);
    if (internal) {
      return (
        <AppLink
          href={url}
          linkStyle={[
            styles.link,
            ...(linkStyle
              ? Array.isArray(linkStyle)
                ? linkStyle
                : [linkStyle]
              : []),
          ]}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(event);
          }}
        >
          {children}
        </AppLink>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={stopBubble}
        {...mergedStyle}
      >
        {children}
      </a>
    );
  }

  return <span>{children}</span>;
}
