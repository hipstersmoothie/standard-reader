"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppLink } from "#/components/reader/app-link";
import { articleBodyStyles } from "#/components/reader/content/body-styles";
import { initials } from "#/components/reader/format";
import {
  DocumentHoverCardBody,
  EntityHoverCard,
  PublicationHoverCardBody,
  UserHoverCardBody,
} from "#/components/reader/mention-hover-card";
import { PublicationAvatar } from "#/components/reader/primitives";
import { Avatar } from "#/design-system/avatar";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { actorLinkIdent } from "#/lib/leaflet/publication-mentions";
import type { ContentLinkTarget } from "#/server/reader/content-links";

/* ── provider ─────────────────────────────────────────────────────────────── */

interface ContentLinkContextValue {
  get: (href: string) => ContentLinkTarget | undefined;
  register: (href: string) => void;
}

const ContentLinkContext = createContext<ContentLinkContextValue | null>(null);

/**
 * Wraps article content (any content type) and lazily resolves the links inside
 * it — each {@link SmartArticleLink} registers its href, and once the article
 * has painted this batches them into one query classifying each as a user,
 * publication, or article on our platform. Resolved links upgrade in place to a
 * mention chip + hovercard; everything else stays a plain link. Runs entirely
 * client-side (off the SSR critical path), so it never blocks first paint.
 */
export function ContentLinkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hrefs, setHrefs] = useState<ReadonlyArray<string>>([]);

  const register = useCallback((href: string) => {
    setHrefs((prev) => (prev.includes(href) ? prev : [...prev, href]));
  }, []);

  const { data } = useQuery({
    ...publicationApi.getContentLinkTargetsQueryOptions([...hrefs]),
    enabled: hrefs.length > 0,
  });

  const value = useMemo<ContentLinkContextValue>(
    () => ({ get: (href) => data?.[href], register }),
    [data, register],
  );

  return (
    <ContentLinkContext.Provider value={value}>
      {children}
    </ContentLinkContext.Provider>
  );
}

function useResolvedContentLink(href: string): ContentLinkTarget | undefined {
  const ctx = useContext(ContentLinkContext);
  useEffect(() => {
    ctx?.register(href);
  }, [href, ctx]);
  return ctx?.get(href);
}

/* ── link ─────────────────────────────────────────────────────────────────── */

/**
 * A link inside article prose that upgrades to a mention chip + hovercard when
 * it points at a user, publication, or article on our platform, and otherwise
 * renders as a plain link. Content-type agnostic — any renderer can use it in
 * place of {@link AppLink} for inline links.
 */
export function SmartArticleLink({
  href,
  children,
  linkStyle,
}: {
  href: string;
  children: React.ReactNode;
  linkStyle?: stylex.StyleXStyles;
}) {
  // A profile link resolves synchronously, so the mention chip is there on the
  // first paint (the avatar fills in once the batch resolves).
  const userIdent = actorLinkIdent(href);
  const target = useResolvedContentLink(href);

  if (userIdent) {
    const resolved = target?.kind === "user" ? target : null;
    return (
      <UserLinkChip
        ident={userIdent}
        handle={resolved?.handle ?? null}
        avatarUrl={resolved?.avatarUrl ?? null}
      >
        {children}
      </UserLinkChip>
    );
  }
  if (target?.kind === "article") {
    return <ArticleLinkChip target={target}>{children}</ArticleLinkChip>;
  }
  if (target?.kind === "publication") {
    return (
      <PublicationLinkChip target={target}>{children}</PublicationLinkChip>
    );
  }
  return (
    <AppLink href={href} linkStyle={linkStyle}>
      {children}
    </AppLink>
  );
}

function UserLinkChip({
  ident,
  handle,
  avatarUrl,
  children,
}: {
  ident: string;
  handle: string | null;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const label = handle ?? nodeText(children) ?? ident;
  return (
    <EntityHoverCard
      onIntent={() =>
        queryClient.prefetchQuery(authorApi.getAuthorSummaryQueryOptions(ident))
      }
      card={
        <UserHoverCardBody
          did={ident}
          fallbackLabel={nodeText(children)}
          fallbackHandle={handle ?? (ident.startsWith("did:") ? null : ident)}
          fallbackAvatarUrl={avatarUrl}
        />
      }
    >
      {({ triggerRef, triggerProps, isHovered }) => (
        <Link
          ref={triggerRef}
          to="/u/$did"
          params={{ did: ident }}
          {...triggerProps}
          data-hovered={isHovered || undefined}
          {...stylex.props(articleBodyStyles.facetMentionLink, styles.chip)}
        >
          {avatarUrl ? (
            <Avatar
              size="sm"
              src={avatarUrl}
              fallback={initials(label)}
              alt={handle ?? ""}
              style={styles.avatar}
            />
          ) : null}
          {children}
        </Link>
      )}
    </EntityHoverCard>
  );
}

function ArticleLinkChip({
  target,
  children,
}: {
  target: Extract<ContentLinkTarget, { kind: "article" }>;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  return (
    <EntityHoverCard
      onIntent={() =>
        queryClient.prefetchQuery(
          publicationApi.getArticleCardQueryOptions(target.documentUri),
        )
      }
      card={
        <DocumentHoverCardBody
          documentUri={target.documentUri}
          did={target.did}
          rkey={target.rkey}
          fallbackTitle={target.title}
        />
      }
    >
      {({ triggerRef, triggerProps, isHovered }) => (
        <Link
          ref={triggerRef}
          to="/a/$did/$rkey"
          params={{ did: target.did, rkey: target.rkey }}
          {...triggerProps}
          data-hovered={isHovered || undefined}
          {...stylex.props(articleBodyStyles.facetMentionLink, styles.chip)}
        >
          {target.publicationIconUrl ? (
            <Avatar
              size="sm"
              src={target.publicationIconUrl}
              alt=""
              fallback={initials(target.title)}
              style={styles.avatar}
            />
          ) : null}
          {children}
        </Link>
      )}
    </EntityHoverCard>
  );
}

function PublicationLinkChip({
  target,
  children,
}: {
  target: Extract<ContentLinkTarget, { kind: "publication" }>;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  return (
    <EntityHoverCard
      onIntent={() =>
        queryClient.prefetchQuery(
          publicationApi.getPublicationHeaderQueryOptions(
            target.publicationUri,
          ),
        )
      }
      card={
        <PublicationHoverCardBody
          publicationUri={target.publicationUri}
          did={target.did}
          rkey={target.rkey}
          fallbackName={target.name}
          fallbackIconUrl={target.iconUrl}
        />
      }
    >
      {({ triggerRef, triggerProps, isHovered }) => (
        <Link
          ref={triggerRef}
          to="/p/$did/$rkey"
          params={{ did: target.did, rkey: target.rkey }}
          {...triggerProps}
          data-hovered={isHovered || undefined}
          {...stylex.props(articleBodyStyles.facetMentionLink, styles.chip)}
        >
          {target.iconUrl ? (
            <PublicationAvatar
              pub={{ name: target.name, iconUrl: target.iconUrl }}
              size="sm"
              style={styles.avatar}
            />
          ) : null}
          {children}
        </Link>
      )}
    </EntityHoverCard>
  );
}

/** Best-effort plaintext from a link's children (for avatar initials). */
function nodeText(node: React.ReactNode): string | undefined {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    const joined = node.map((child) => nodeText(child) ?? "").join("");
    if (joined !== "") return joined;
    return;
  }
  return;
}

const styles = stylex.create({
  chip: {
    whiteSpace: "nowrap",
  },
  avatar: {
    display: "inline-flex",
    width: "1.05em",
    height: "1.05em",
    marginRight: "0.25em",
    verticalAlign: "-0.2em",
  },
});
