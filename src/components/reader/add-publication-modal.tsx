"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { Plus, Search as SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../design-system/button";
import { Dialog, DialogHeader } from "../../design-system/dialog";
import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { ModalPubRow, PubDirectoryRowSkeleton } from "./cards";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const SUGGESTION_LIMIT = 6;
const SKELETON_ROWS = 4;

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    maxHeight: "56vh",
    overflowY: "auto",
    paddingBottom: spacing["5"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
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
    rowGap: spacing["2.5"],
    transitionProperty: "border-color",
    paddingLeft: spacing["3.5"],
    paddingRight: spacing["3.5"],
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
    minWidth: 0,
    paddingBottom: spacing["3"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpenProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (isOpenProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
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
    } else {
      setInput("");
      setDebouncedQ("");
    }
  }, [open]);

  const hasQuery = debouncedQ.length > 0;
  const trimmedInput = input.trim();
  const isSearching = hasQuery && trimmedInput !== debouncedQ;

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

  const publications = hasQuery ? (searchPage?.items ?? []) : (trending ?? []);
  const loading =
    isSearching ||
    (hasQuery ? searchFetching && !searchPage : trendingFetching && !trending);

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
            <Plus size={16} /> Add publication
          </Button>
        ) : (
          <span hidden aria-hidden />
        )
      }
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>Add a publication</span>
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
            placeholder="Search the directory by name or topic"
            aria-label="Search publications"
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
                isLast={index === publications.length - 1}
                onNavigate={closeModal}
              />
            ))
          ) : hasQuery ? (
            <p {...stylex.props(styles.emptyNote)}>
              No matches in the directory.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
