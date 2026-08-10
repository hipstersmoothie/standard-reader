"use client";

import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  ListBox,
  ListBoxItem,
  ListBoxSection,
  ListBoxSectionHeader,
} from "@standard-reader/design-system/listbox";
import { Popover } from "@standard-reader/design-system/popover";
import { SearchField } from "@standard-reader/design-system/search-field";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { TagGroup, Tag } from "@standard-reader/design-system/tag-group";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { ListFilter } from "lucide-react";
import { useMemo, useState } from "react";
import type { Selection } from "react-aria-components";
import { Autocomplete, useFilter } from "react-aria-components";

import type {
  SavedFacetOption,
  SavedFacets,
} from "#/integrations/tanstack-query/api-reader.functions";
import type { SavedFacetName, SavedFilterValues } from "#/lib/saved-filters";
import {
  countSavedFilters,
  facetKey,
  parseFacetKey,
} from "#/lib/saved-filters";

const styles = stylex.create({
  trigger: {
    position: "relative",
  },
  // Marks the closed trigger while a filter is narrowing the list, so a
  // filtered-down page never reads as an empty queue. Drawn as a
  // pseudo-element, not a child span: an extra element after the icon matches
  // the design system's `:has(svg+*)` padding rule for icon+label buttons and
  // pulls the centred icon off-centre. Same treatment as `/feedback`.
  triggerActive: {
    "::after": {
      backgroundColor: primaryColor.solid1,
      borderRadius: radius.full,
      content: "''",
      insetBlockStart: spacing["2"],
      insetInlineEnd: spacing["2"],
      position: "absolute",
      height: spacing["1.5"],
      width: spacing["1.5"],
    },
  },
  // The popover's own padding is stripped so the search field can sit flush
  // against the top edge and the list can scroll under it.
  popover: {
    boxSizing: "border-box",
    paddingBottom: 0,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    paddingTop: 0,
    maxWidth: "100%",
    width: spacing["80"],
  },
  searchRow: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["2"],
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    paddingTop: spacing["2"],
  },
  listScroller: {
    // Capped against the viewport as well as an absolute ceiling: on a short
    // window the popover must not run off the bottom of the screen.
    maxHeight: "min(24rem, 50vh)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBottom: spacing["2"],
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    paddingTop: spacing["2"],
  },
  itemLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDetail: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
  },
  itemCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontVariantNumeric: "tabular-nums",
  },
  emptyState: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    paddingBottom: spacing["4"],
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
    paddingTop: spacing["4"],
    textAlign: "center",
  },
  footer: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: spacing["2"],
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["3"],
    paddingTop: spacing["2"],
  },
  footerCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  loadingRows: {
    paddingBottom: spacing["3"],
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
    paddingTop: spacing["3"],
  },
  chipRow: {
    marginTop: spacing["4"],
  },
});

interface FacetSection {
  name: SavedFacetName;
  heading: React.ReactNode;
  options: Array<SavedFacetOption>;
}

/**
 * The filter surface for `/saved`: a popover holding every publication,
 * author, and tag the reader has saved something from, type-ahead filtered and
 * multi-select.
 *
 * Selections apply immediately and the popover stays open — narrowing a queue
 * is usually two or three ticks, and a confirm step would make each one cost a
 * round of open/close.
 */
export function SavedFilterPopover({
  facets,
  isPending,
  value,
  onChange,
  onOpenChange,
}: {
  facets: SavedFacets | undefined;
  /** Facet options are still loading. The popover opens to skeleton rows
   * rather than an empty list that reads as "nothing to filter by". */
  isPending: boolean;
  value: SavedFilterValues;
  onChange: (next: SavedFilterValues) => void;
  /** Fired on open so the page can start the facets fetch for a reader who
   * never idles long enough to prefetch it. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { contains } = useFilter({ sensitivity: "base" });
  const [query, setQuery] = useState("");
  const activeCount = countSavedFilters(value);

  const sections: Array<FacetSection> = useMemo(
    () =>
      [
        {
          heading: <Trans>Publications</Trans>,
          name: "pubs" as const,
          options: facets?.publications ?? [],
        },
        {
          heading: <Trans>Authors</Trans>,
          name: "authors" as const,
          options: facets?.authors ?? [],
        },
        {
          heading: <Trans>Tags</Trans>,
          name: "tags" as const,
          options: facets?.tags ?? [],
        },
      ].filter((section) => section.options.length > 0),
    [facets],
  );

  const selectedKeys = useMemo(
    () =>
      new Set([
        ...value.pubs.map((id) => facetKey("pubs", id)),
        ...value.authors.map((id) => facetKey("authors", id)),
        ...value.tags.map((id) => facetKey("tags", id)),
      ]),
    [value],
  );

  const handleSelectionChange = (keys: Selection) => {
    // "all" only arrives from select-all, which this list doesn't offer.
    if (keys === "all") return;
    const next: SavedFilterValues = { authors: [], pubs: [], tags: [] };
    for (const key of keys) {
      const parsed = parseFacetKey(key);
      if (parsed) next[parsed.facet].push(parsed.id);
    }
    onChange(next);
  };

  const label =
    activeCount === 0
      ? t`Filter saved articles`
      : t`Filter saved articles — ${plural(activeCount, {
          one: "# filter active",
          other: "# filters active",
        })}`;

  return (
    <Popover
      placement="bottom end"
      style={styles.popover}
      onOpenChange={(open) => {
        // Reset the type-ahead between visits: reopening to yesterday's search
        // term, with most options hidden, reads as data loss.
        if (!open) setQuery("");
        onOpenChange?.(open);
      }}
      trigger={
        <IconButton
          size="lg"
          variant="secondary"
          label={label}
          // `label` only feeds the tooltip (react-aria wires it through
          // `aria-describedby`, and only while open), so name the button
          // explicitly for assistive tech and touch users.
          aria-label={label}
          style={[styles.trigger, activeCount > 0 && styles.triggerActive]}
        >
          <ListFilter size={16} strokeWidth={2} />
        </IconButton>
      }
    >
      <Autocomplete
        filter={contains}
        inputValue={query}
        onInputChange={setQuery}
      >
        <div {...stylex.props(styles.searchRow)}>
          {/* No `autoFocus`: the popover is a react-aria dialog, so it already
              moves focus to its first focusable child — this field — on open. */}
          <SearchField
            size="md"
            variant="secondary"
            aria-label={t`Find a publication, author, or tag`}
            placeholder={t`Filter by…`}
          />
        </div>

        {isPending && sections.length === 0 ? (
          <div
            {...stylex.props(styles.loadingRows)}
            aria-busy="true"
            aria-label={t`Loading filter options`}
          >
            <Flex direction="column" gap="lg">
              {["a", "b", "c", "d"].map((row) => (
                <Skeleton key={row} variant="rectangle" height="1.25rem" />
              ))}
            </Flex>
          </div>
        ) : (
          <div {...stylex.props(styles.listScroller)}>
            <ListBox
              variant="checkbox"
              size="md"
              selectionMode="multiple"
              selectedKeys={selectedKeys}
              onSelectionChange={handleSelectionChange}
              aria-label={t`Filter saved articles`}
              renderEmptyState={() => (
                <p {...stylex.props(styles.emptyState)}>
                  {query
                    ? t`Nothing saved matches “${query}”.`
                    : t`Nothing to filter by yet.`}
                </p>
              )}
            >
              {sections.map((section) => (
                <ListBoxSection key={section.name} id={section.name}>
                  <ListBoxSectionHeader>{section.heading}</ListBoxSectionHeader>
                  {section.options.map((option) => (
                    <ListBoxItem
                      key={facetKey(section.name, option.id)}
                      id={facetKey(section.name, option.id)}
                      // Handles join the searchable text so typing
                      // "@alice.dev" finds the author whose display name is
                      // "Alice", which is how people actually look for a byline.
                      textValue={
                        option.detail && option.detail !== option.label
                          ? `${option.label} ${option.detail}`
                          : option.label
                      }
                      suffix={
                        <span {...stylex.props(styles.itemCount)}>
                          {option.count}
                        </span>
                      }
                    >
                      <span {...stylex.props(styles.itemLabel)}>
                        {option.label}
                        {option.detail && option.detail !== option.label ? (
                          <>
                            {" "}
                            <span {...stylex.props(styles.itemDetail)}>
                              @{option.detail}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </ListBoxItem>
                  ))}
                </ListBoxSection>
              ))}
            </ListBox>
          </div>
        )}

        {activeCount > 0 ? (
          <Flex
            direction="row"
            gap="md"
            align="center"
            justify="between"
            style={styles.footer}
          >
            <span {...stylex.props(styles.footerCount)}>
              {/* `<Plural>`, not the bare `plural()` macro: standalone
                  `plural()` compiles against Lingui's global singleton, which
                  this app never activates — it runs a per-locale instance (see
                  `src/lib/i18n.ts`). The component reads that instance from
                  context. */}
              <Plural value={activeCount} one="# filter" other="# filters" />
            </span>
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => onChange({ authors: [], pubs: [], tags: [] })}
            >
              <Trans>Clear all</Trans>
            </Button>
          </Flex>
        ) : null}
      </Autocomplete>
    </Popover>
  );
}

/**
 * The applied filters, spelled out and individually removable.
 *
 * The trigger's dot says *that* something is filtered; this says *what*. On a
 * page a reader comes back to days later — with filters restored from the URL
 * — that difference is the whole story of why the queue looks short.
 */
export function SavedFilterChips({
  facets,
  value,
  onChange,
  onClear,
}: {
  facets: SavedFacets | undefined;
  value: SavedFilterValues;
  onChange: (next: SavedFilterValues) => void;
  onClear: () => void;
}) {
  const { t } = useLingui();

  const chips = useMemo(() => {
    const labelFor = (options: Array<SavedFacetOption>, id: string) =>
      options.find((option) => option.id === id)?.label;
    return [
      ...value.pubs.map((id) => ({
        facet: "pubs" as const,
        id,
        // Until the facets land there's no name for an AT-URI or a DID, so the
        // chip says what it is rather than showing raw identifier soup.
        label: labelFor(facets?.publications ?? [], id) ?? t`Publication`,
      })),
      ...value.authors.map((id) => ({
        facet: "authors" as const,
        id,
        label: labelFor(facets?.authors ?? [], id) ?? t`Author`,
      })),
      ...value.tags.map((id) => ({
        facet: "tags" as const,
        id,
        label: labelFor(facets?.tags ?? [], id) ?? id,
      })),
    ].map((chip) => ({ ...chip, key: facetKey(chip.facet, chip.id) }));
  }, [facets, t, value]);

  if (chips.length === 0) return null;

  return (
    <Flex direction="row" gap="md" align="center" wrap style={styles.chipRow}>
      <TagGroup
        items={chips}
        aria-label={t`Active filters`}
        onRemove={(keys) => {
          const next: SavedFilterValues = {
            authors: [...value.authors],
            pubs: [...value.pubs],
            tags: [...value.tags],
          };
          for (const key of keys) {
            const parsed = parseFacetKey(key);
            if (parsed) {
              next[parsed.facet] = next[parsed.facet].filter(
                (id) => id !== parsed.id,
              );
            }
          }
          onChange(next);
        }}
      >
        {(chip: (typeof chips)[number]) => (
          <Tag key={chip.key} id={chip.key} textValue={chip.label}>
            {chip.label}
          </Tag>
        )}
      </TagGroup>
      <Button size="md" variant="tertiary" onPress={onClear}>
        <Trans>Clear all</Trans>
      </Button>
    </Flex>
  );
}
