"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Dialog, DialogHeader } from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search as SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { isHandleLikeInput } from "#/lib/publication/handle-input";

import { ModalPubRow, PubDirectoryRowSkeleton } from "./cards";
import { initials } from "./format";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const SUGGESTION_LIMIT = 6;
const SKELETON_ROWS = 4;

const styles = stylex.create({
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    maxHeight: "56vh",
    overflowY: "auto",
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  searchField: {
    borderColor: {
      default: uiColor.border2,
      ":focus-within": uiColor.border3,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    columnGap: spacing["2.5"],
    display: "flex",
    paddingInlineEnd: spacing["3.5"],
    paddingInlineStart: spacing["3.5"],
    rowGap: spacing["2.5"],
    transitionProperty: "border-color",
  },
  searchIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  searchInput: {
    borderStyle: "none",
    backgroundColor: "transparent",
    color: uiColor.text2,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    outlineStyle: "none",
    paddingInlineEnd: spacing["0"],
    paddingInlineStart: spacing["0"],
    minWidth: 0,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  searchInputPlaceholder: {
    "::placeholder": {
      color: uiColor.text1,
    },
  },
  results: {
    marginTop: spacing["2.5"],
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  skeletonWrap: {
    marginTop: gap["md"],
  },
  disabledRow: {
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    opacity: 0.6,
    rowGap: spacing["3.5"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 0,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  disabledName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  disabledNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
  },
  trigger: {
    width: "100%",
  },
});

export function AddPublicationModal({
  isOpen: isOpenProp,
  onOpenChange,
  showTrigger = true,
}: {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
} = {}) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpenProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (isOpenProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setInput("");
      setDebouncedQ("");
    }
  };
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedQ(input.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const hasQuery = debouncedQ.length > 0;
  const trimmedInput = input.trim();
  const isSearching = hasQuery && trimmedInput !== debouncedQ;
  const handleLike = hasQuery && isHandleLikeInput(debouncedQ);

  const { data: resolvedHandle, isFetching: resolveFetching } = useQuery({
    ...searchApi.resolvePublicationByHandleQueryOptions(debouncedQ),
    enabled: open && handleLike,
  });

  const { data: searchPage, isFetching: searchFetching } = useQuery({
    ...searchApi.searchPublicationsQueryOptions({
      q: debouncedQ,
      limit: SEARCH_PAGE_SIZE,
    }),
    enabled: open && hasQuery,
  });

  const { data: trending, isFetching: trendingFetching } = useQuery({
    ...discoverApi.getTrendingPublicationsQueryOptions({
      limit: SUGGESTION_LIMIT,
    }),
    enabled: open && !hasQuery,
  });

  const { data: looseDocAccounts, isFetching: looseAccountsFetching } =
    useQuery({
      ...searchApi.searchLooseDocAccountsQueryOptions({
        q: debouncedQ,
        limit: 3,
      }),
      enabled: open && hasQuery,
    });

  // For handle-like input, prefer exact-handle resolution but also run the
  // partial directory search in parallel and merge (deduped by URI) so partial
  // handle / display-name matches surface even when resolution is pending or
  // resolves an account with no publications.
  const resolvedPubs = handleLike ? (resolvedHandle?.publications ?? []) : [];
  const directoryPubs = hasQuery ? (searchPage?.items ?? []) : [];
  const seenUris = new Set(resolvedPubs.map((pub) => pub.uri));
  const extraDirectoryPubs = directoryPubs.filter(
    (pub) => !seenUris.has(pub.uri),
  );
  const publications = handleLike
    ? [...resolvedPubs, ...extraDirectoryPubs]
    : hasQuery
      ? directoryPubs
      : (trending ?? []);
  const accounts = looseDocAccounts ?? [];
  const loading =
    isSearching ||
    (handleLike
      ? resolveFetching && !resolvedHandle && searchFetching && !searchPage
      : hasQuery
        ? searchFetching &&
          !searchPage &&
          looseAccountsFetching &&
          !looseDocAccounts
        : trendingFetching && !trending);

  // Exact-handle resolution surfaced an account with loose docs but no pubs.
  const showResolvedDisabledAccount =
    handleLike &&
    !loading &&
    publications.length === 0 &&
    Boolean(resolvedHandle?.did && resolvedHandle.hasDocuments);

  // Partial-match directory search surfaced accounts with loose docs but no
  // pubs. Shown as disabled rows beneath any publication results.
  const showLooseDocAccounts = !loading && hasQuery && accounts.length > 0;

  const handleEmptyNote = (() => {
    if (
      !handleLike ||
      loading ||
      publications.length > 0 ||
      showResolvedDisabledAccount
    ) {
      return null;
    }
    if (!resolvedHandle?.did) {
      return t`Couldn't resolve that handle.`;
    }
    const handleLabel = resolvedHandle.handle
      ? `@${resolvedHandle.handle}`
      : null;
    return handleLabel
      ? t`No publications found for ${handleLabel}.`
      : t`No publications found for this account.`;
  })();

  const closeModal = () => setOpen(false);

  return (
    <Dialog
      isOpen={open}
      onOpenChange={setOpen}
      size="md"
      fitContent
      trigger={
        showTrigger ? (
          <Button variant="primary" style={styles.trigger}>
            <Plus size={16} /> <Trans>Add publication</Trans>
          </Button>
        ) : (
          <span hidden aria-hidden />
        )
      }
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>
          <Trans>Add a publication</Trans>
        </span>
      </DialogHeader>
      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.searchField)}>
          <SearchIcon
            aria-hidden
            size={17}
            {...stylex.props(styles.searchIcon)}
          />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t`Search by name, topic, or paste a handle (@user.domain)`}
            aria-label={t`Search publications or paste a handle`}
            {...stylex.props(styles.searchInput, styles.searchInputPlaceholder)}
          />
        </div>

        <div {...stylex.props(styles.results)}>
          {loading ? (
            <div {...stylex.props(styles.skeletonWrap)}>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <PubDirectoryRowSkeleton
                  key={index}
                  isFirstInSection={index === 0}
                  isLast={index === SKELETON_ROWS - 1}
                />
              ))}
            </div>
          ) : publications.length > 0 ? (
            publications.map((pub, index) => (
              <ModalPubRow
                key={pub.uri}
                pub={pub}
                signedIn={signedIn}
                isLast={
                  index === publications.length - 1 && !showLooseDocAccounts
                }
                onNavigate={closeModal}
              />
            ))
          ) : showResolvedDisabledAccount && resolvedHandle?.did ? (
            <div
              {...stylex.props(styles.disabledRow)}
              aria-disabled="true"
              title={t`This account has documents but no publications to subscribe to`}
            >
              <Avatar
                size="lg"
                fallback={initials(resolvedHandle.handle ?? resolvedHandle.did)}
                alt={resolvedHandle.handle ?? resolvedHandle.did}
              />
              <Flex direction="column" gap="xs">
                <span {...stylex.props(styles.disabledName)}>
                  {resolvedHandle.handle
                    ? `@${resolvedHandle.handle}`
                    : resolvedHandle.did}
                </span>
                <span {...stylex.props(styles.disabledNote)}>
                  <Trans>Has documents but no publications</Trans>
                </span>
              </Flex>
            </div>
          ) : handleEmptyNote ? (
            <p {...stylex.props(styles.emptyNote)}>{handleEmptyNote}</p>
          ) : hasQuery && !showLooseDocAccounts ? (
            <p {...stylex.props(styles.emptyNote)}>
              <Trans>No matches in the directory.</Trans>
            </p>
          ) : null}
          {showLooseDocAccounts
            ? accounts.map((account) => (
                <div
                  key={account.did}
                  {...stylex.props(styles.disabledRow)}
                  aria-disabled="true"
                  title={t`This account has documents but no publications to subscribe to`}
                >
                  <Avatar
                    size="lg"
                    src={account.avatarUrl ?? undefined}
                    fallback={initials(
                      account.displayName ?? account.handle ?? account.did,
                    )}
                    alt={account.handle ?? account.did}
                  />
                  <Flex direction="column" gap="xs">
                    <span {...stylex.props(styles.disabledName)}>
                      {account.displayName ?? account.handle ?? account.did}
                    </span>
                    {account.handle ? (
                      <span {...stylex.props(styles.disabledNote)}>
                        <Trans>
                          @{account.handle} · Has documents but no publications
                        </Trans>
                      </span>
                    ) : (
                      <span {...stylex.props(styles.disabledNote)}>
                        <Trans>Has documents but no publications</Trans>
                      </span>
                    )}
                  </Flex>
                </div>
              ))
            : null}
        </div>
      </div>
    </Dialog>
  );
}
