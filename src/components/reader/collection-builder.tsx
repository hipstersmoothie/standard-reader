"use client";

import type {
  CollectionForEdit,
  CollectionsPublicationSummary,
} from "#/integrations/tanstack-query/api-collections.functions";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { DropTarget, Key } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Layers,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { GridList, GridListItem, useDragAndDrop } from "react-aria-components";

import { Button } from "../../design-system/button";
import { Dialog, DialogBody, DialogHeader } from "../../design-system/dialog";
import {
  FileDropDefaultTrigger,
  FileDropZone,
} from "../../design-system/file-drop-zone";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Label } from "../../design-system/label";
import { ListBox, ListBoxItem } from "../../design-system/listbox";
import { ProgressCircle } from "../../design-system/progress-circle";
import { SearchField } from "../../design-system/search-field";
import { Select, SelectItem } from "../../design-system/select";
import { TextField } from "../../design-system/text-field";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  horizontalSpace,
  size,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { shadow } from "../../design-system/theme/shadow.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { ArticleResultRow } from "./article-result-row";
import { CollectionPublicationCreateDialog } from "./collection-publication-editor";
import { MarkdownField } from "./markdown-field";
import { Kicker, SectionHead } from "./primitives";

const COLLECTIONS_QUERY_KEY = ["reader", "collections"] as const;
const COLLECTION_EDIT_QUERY_KEY = ["reader", "collectionEdit"] as const;
const MAX_ITEMS = 42;

/** Centered, max-width inner container shared by the header and each band. */
const innerPadding = {
  marginLeft: "auto",
  marginRight: "auto",
  maxWidth: "1320px",
  paddingLeft: {
    default: spacing["5"],
    "@media (min-width: 40rem)": spacing["10"],
  },
  paddingRight: {
    default: spacing["5"],
    "@media (min-width: 40rem)": spacing["10"],
  },
  width: "100%",
} as const;

/** Half of the inter-card gap; paired padding between neighbors equals CARD_GAP. */
const CARD_SLOT_HALF = spacing["2"];
const CARD_GAP = spacing["4"];

const styles = stylex.create({
  noteField: {
    columnGap: 0,
    rowGap: 0,
  },
  // ── Page header (mirrors the list page hero) ──
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["4"],
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
    ...innerPadding,
  },
  heroInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "240px",
  },
  heroName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    marginBottom: 0,
    marginTop: spacing["2"],
  },
  heroDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: 0,
    marginTop: spacing["2"],
    maxWidth: "60ch",
  },
  heroActs: {
    alignItems: "center",
    columnGap: spacing["2"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    rowGap: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  // ── Full-page-width bordered band + centered content ──
  band: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    width: "100%",
  },
  bandInner: {
    boxSizing: "border-box",
    paddingBottom: spacing["10"],
    paddingTop: spacing["8"],
    ...innerPadding,
  },
  // ── Article items (variant A — indexed card) ──
  gridListShell: {
    position: "relative",
    width: "100%",
  },
  gridList: {
    outline: "none",
  },
  gridListItem: {
    outline: "none",
    position: "relative",
    width: "100%",
  },
  cardSlotPaddingTop: {
    paddingTop: CARD_SLOT_HALF,
  },
  cardSlotPaddingBottom: {
    paddingBottom: CARD_SLOT_HALF,
  },
  cardSlotPaddingBoth: {
    paddingBottom: CARD_SLOT_HALF,
    paddingTop: CARD_SLOT_HALF,
  },
  cardRow: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bg,
    display: "grid",
    gridTemplateColumns: "2.75rem minmax(0, 1fr)",
  },
  cardRowDragging: {
    opacity: 0.5,
  },
  dragHandle: {
    color: uiColor.text1,
    cursor: "grab",
  },
  dropOverlay: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
    zIndex: 2,
    height: CARD_GAP,
    left: 0,
    right: 0,
  },
  dropIndicatorBar: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    outlineColor: primaryColor.solid1,
    outlineOffset: spacing["0.5"],
    outlineStyle: "solid",
    outlineWidth: 1,
    height: spacing["0.5"],
    width: "100%",
  },
  dragPreview: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
    display: "grid",
    gridTemplateColumns: "2.75rem minmax(0, 1fr)",
    maxWidth: "28rem",
    width: "max-content",
  },
  dragPreviewRail: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["1"],
    borderRightColor: uiColor.border1,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.sm,
  },
  dragPreviewGrip: {
    color: uiColor.text1,
    display: "flex",
    flexShrink: 0,
  },
  dragPreviewBody: {
    alignSelf: "center",
    minWidth: 0,
    paddingBottom: verticalSpace.sm,
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
    paddingTop: verticalSpace.sm,
  },
  dragPreviewTitle: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rail: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
    borderRightColor: uiColor.border1,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    paddingBottom: spacing["2"],
    paddingTop: spacing["3"],
  },
  ord: {
    color: uiColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing["1"],
  },
  railCtl: {
    display: "flex",
    flexDirection: "column",
  },
  cardBody: {
    minWidth: 0,
    paddingLeft: spacing["4"],
    paddingRight: spacing["4"],
    paddingTop: spacing["4"],
  },
  noteFooter: {
    backgroundColor: uiColor.bgSubtle,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginLeft: `calc(${spacing["4"]} * -1)`,
    marginRight: `calc(${spacing["4"]} * -1)`,
    marginTop: spacing["4"],
    paddingBottom: spacing["3"],
    paddingLeft: spacing["4"],
    paddingRight: spacing["4"],
    paddingTop: spacing["3"],
  },
  itemTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    minWidth: 0,
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
  },
  addList: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    maxHeight: "20rem",
    overflowY: "auto",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  addEmpty: {
    display: "block",
    paddingBottom: verticalSpace.lg,
    paddingLeft: horizontalSpace.xl,
    paddingRight: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
  },
  addSearching: {
    paddingBottom: verticalSpace.lg,
    paddingLeft: horizontalSpace.xl,
    paddingRight: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
  },
  coverPreview: {
    borderRadius: radius.md,
    backgroundColor: uiColor.component1,
    objectFit: "cover",
    height: "8rem",
    width: "14rem",
  },
  dropZone: {
    gap: spacing["2"],
    color: uiColor.text1,
    flexGrow: 1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    minHeight: size["8xl"],
  },
  errorNote: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontStyle: "normal",
  },
});

/** Sentinel option for the publication select's "create new" action. */
const CREATE_PUBLICATION = "__create__";

interface BuilderItem {
  uri: string;
  title: string;
  note: string;
  card: ArticleCard | null;
}

function toBuilderItem(item: {
  document: string;
  title: string;
  note?: string | null;
  card: ArticleCard | null;
}): BuilderItem {
  return {
    uri: item.document,
    title: item.title,
    note: item.note ?? "",
    card: item.card,
  };
}

function moveItem(
  items: Array<BuilderItem>,
  index: number,
  delta: number,
): Array<BuilderItem> {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Keep note-field interactions from starting a GridList row drag. */
function isolateNoteFieldFromRowDrag(event: React.SyntheticEvent) {
  event.stopPropagation();
  if (event.type === "dragstart") {
    event.preventDefault();
  }
}

/** Reorder builder items per a react-aria drop event. */
function reorderBuilderItems(
  items: Array<BuilderItem>,
  keys: Set<Key>,
  targetKey: Key,
  dropPosition: "before" | "after" | "on",
): Array<BuilderItem> {
  const keySet = new Set([...keys].map(String));
  const targetKeyStr = String(targetKey);
  if (dropPosition === "on" || keySet.has(targetKeyStr)) return items;

  const moving = items.filter((item) => keySet.has(item.uri));
  const remaining = items.filter((item) => !keySet.has(item.uri));
  const targetIndex = remaining.findIndex((item) => item.uri === targetKeyStr);
  if (targetIndex === -1 || moving.length === 0) return items;

  const insertAt = dropPosition === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...remaining.slice(0, insertAt),
    ...moving,
    ...remaining.slice(insertAt),
  ];
}

type ItemDropSlot = Extract<DropTarget, { type: "item" }>;

function computeDropOverlayTop(
  drop: ItemDropSlot,
  listEl: HTMLElement,
  itemEl: HTMLElement,
): number {
  const listTop = listEl.getBoundingClientRect().top;
  const itemRect = itemEl.getBoundingClientRect();
  const itemTop = itemRect.top - listTop;
  const itemBottom = itemRect.bottom - listTop;

  if (drop.dropPosition === "before") {
    return Math.max(0, itemTop);
  }
  if (drop.dropPosition === "after") {
    return itemBottom;
  }
  return itemTop;
}

/** Compact card shown under the cursor while reordering. */
function CollectionArticleDragPreview({
  item,
  index,
}: {
  item: BuilderItem;
  index: number;
}) {
  return (
    <div {...stylex.props(styles.dragPreview)}>
      <div {...stylex.props(styles.dragPreviewRail)}>
        <span {...stylex.props(styles.ord)}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span {...stylex.props(styles.dragPreviewGrip)}>
          <GripVertical size={16} aria-hidden />
        </span>
      </div>
      <div {...stylex.props(styles.dragPreviewBody)}>
        {item.card ? (
          <ArticleResultRow article={item.card} variant="compact" />
        ) : (
          <span {...stylex.props(styles.dragPreviewTitle)}>{item.title}</span>
        )}
      </div>
    </div>
  );
}

/** Floating drop line — rendered over reserved card gutters, not in document flow. */
function CollectionDropOverlay({
  drop,
  listRef,
  itemRefs,
}: {
  drop: ItemDropSlot;
  listRef: React.RefObject<HTMLElement | null>;
  itemRefs: React.RefObject<Map<string, HTMLElement>>;
}) {
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const update = () => {
      const list = listRef.current;
      const item = itemRefs.current.get(String(drop.key));
      if (!list || !item) return;
      setTop(computeDropOverlayTop(drop, list, item));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [drop, listRef, itemRefs]);

  return (
    <div {...stylex.props(styles.dropOverlay)} style={{ top: `${top}px` }}>
      <div {...stylex.props(styles.dropIndicatorBar)} aria-hidden />
    </div>
  );
}

/** Padding gutters that reserve drop-target space without shifting on drag. */
function cardSlotPaddingStyles(
  index: number,
  count: number,
): Array<stylex.StyleXStyles | false> {
  if (count <= 1) return [];
  const isFirst = index === 0;
  const isLast = index === count - 1;
  return [
    isFirst && !isLast && styles.cardSlotPaddingBottom,
    !isFirst && isLast && styles.cardSlotPaddingTop,
    !isFirst && !isLast && styles.cardSlotPaddingBoth,
  ];
}

/**
 * The collection builder form, rendered as page content. `initial` switches it
 * to edit mode (preserves the rkey). Calls `onSaved` after a successful write.
 */
export function CollectionBuilder({
  publicationUri,
  initial,
  onSaved,
  onCancel,
}: {
  publicationUri: string;
  initial?: CollectionForEdit | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [editorialBody, setEditorialBody] = useState(
    initial?.editorial?.body ?? "",
  );
  const [items, setItems] = useState<Array<BuilderItem>>(
    () => initial?.items.map(toBuilderItem) ?? [],
  );
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [coverImage, setCoverImage] = useState<Record<string, unknown> | null>(
    initial?.coverImage ?? null,
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    initial?.coverImageUrl ?? null,
  );
  const [selectedPubUri, setSelectedPubUri] = useState(
    initial?.publicationUri ?? publicationUri,
  );
  const [createPubOpen, setCreatePubOpen] = useState(false);

  const saveMutation = useMutation(
    collectionsApi.putCollectionMutationOptions(),
  );
  const coverMutation = useMutation(
    collectionsApi.uploadCollectionCoverMutationOptions(),
  );
  const busy = saveMutation.isPending;

  const { data: publications = [] } = useQuery(
    collectionsApi.listCollectionsPublicationsQueryOptions(),
  );
  // Always include the current target, even before the list query resolves or
  // if it isn't flagged, so the select never shows a blank value.
  const pubOptions: Array<CollectionsPublicationSummary> = [
    ...(publications.some((pub) => pub.uri === selectedPubUri)
      ? []
      : [
          {
            uri: selectedPubUri,
            rkey: "",
            name: "Series",
            description: null,
            iconUrl: null,
            theme: {
              background: null,
              foreground: null,
              accent: null,
              accentForeground: null,
              fontTitle: null,
              fontBody: null,
            },
            subscriberCount: 0,
          },
        ]),
    ...publications,
  ];

  const onCoverFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.slice(result.indexOf(",") + 1);
      if (!base64) return;
      coverMutation.mutate(
        { dataBase64: base64, mimeType: file.type },
        {
          onSuccess: (data) => {
            setCoverImage(data.blob);
            setCoverUrl(data.url ?? URL.createObjectURL(file));
          },
        },
      );
    });
    reader.readAsDataURL(file);
  };

  const removeCover = () => {
    setCoverImage(null);
    setCoverUrl(null);
  };

  const { data: searchData, isFetching: isSearching } = useInfiniteQuery(
    searchApi.searchArticlesInfiniteQueryOptions({ q: search }),
  );
  const chosen = new Set(items.map((item) => item.uri));
  // The server matches on title/body, author handle, and record/URL refs — so
  // surface its results as-is rather than re-filtering on title text here.
  const candidates = (searchData?.pages.flatMap((page) => page.items) ?? [])
    .filter((article) => !chosen.has(article.uri))
    .slice(0, 12);

  const addArticle = (uri: string) => {
    const article = searchData?.pages
      .flatMap((page) => page.items)
      .find((a) => a.uri === uri);
    if (!article || chosen.has(uri) || items.length >= MAX_ITEMS) return;
    setItems((current) => [
      ...current,
      { uri, title: article.title, note: "", card: article },
    ]);
  };

  const removeItem = (uri: string) => {
    setItems((current) => current.filter((item) => item.uri !== uri));
  };

  const setNote = (uri: string, note: string) => {
    setItems((current) =>
      current.map((item) => (item.uri === uri ? { ...item, note } : item)),
    );
  };

  const nudgeItem = (index: number, delta: number) => {
    setItems((current) => moveItem(current, index, delta));
  };

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [dropSlot, setDropSlot] = useState<ItemDropSlot | null>(null);

  const setItemRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  }, []);

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    renderDragPreview(dragItems) {
      const uri = String(dragItems[0]?.["text/plain"] ?? "");
      const index = items.findIndex((item) => item.uri === uri);
      const item = items[index];
      if (!item) {
        return null as unknown as React.ReactElement;
      }
      return {
        element: <CollectionArticleDragPreview item={item} index={index} />,
        // Anchor the preview to the grip handle in the left rail.
        x: 22,
        y: 40,
      };
    },
    renderDropIndicator: () => null as unknown as React.ReactElement,
    onDropEnter(event) {
      const { target } = event;
      if (target.type === "item" && target.dropPosition !== "on") {
        setDropSlot(target);
      }
    },
    onDropExit() {
      setDropSlot(null);
    },
    onDragEnd() {
      setDropSlot(null);
    },
    onReorder(event) {
      setDropSlot(null);
      setItems((current) =>
        reorderBuilderItems(
          current,
          event.keys,
          event.target.key,
          event.target.dropPosition,
        ),
      );
    },
  });

  const save = () => {
    if (title.trim().length === 0 || items.length === 0 || busy) return;
    saveMutation.mutate(
      {
        publicationUri: selectedPubUri,
        rkey: initial?.rkey,
        title: title.trim(),
        editorial: editorialBody.trim()
          ? { body: editorialBody.trim() }
          : undefined,
        items: items.map((item) => ({
          document: item.uri,
          note: item.note.trim() || undefined,
        })),
        coverImage,
      },
      {
        onSuccess: onSaved,
        onSettled: () => {
          void queryClient.invalidateQueries({
            queryKey: COLLECTIONS_QUERY_KEY,
          });
          // The editor query now has a non-zero staleTime, so re-entering the
          // builder after a save must drop the cached snapshot for this rkey.
          void queryClient.invalidateQueries({
            queryKey: COLLECTION_EDIT_QUERY_KEY,
          });
        },
      },
    );
  };

  const error = saveMutation.error;

  return (
    <div>
      <div {...stylex.props(styles.heroInner)}>
        <div {...stylex.props(styles.heroInfo)}>
          <Kicker icon={<Layers size={14} aria-hidden />}>Collections</Kicker>
          <h1 {...stylex.props(styles.heroName)}>
            {initial ? "Edit collection" : "New collection"}
          </h1>
          <p {...stylex.props(styles.heroDesc)}>
            Choose a series, give it a title and cover, then assemble the
            articles you want to feature.
          </p>
        </div>
        <div {...stylex.props(styles.heroActs)}>
          <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isDisabled={busy || title.trim().length === 0 || items.length === 0}
            onPress={save}
          >
            {initial ? "Save collection" : "Create collection"}
          </Button>
        </div>
      </div>

      <div {...stylex.props(styles.band)}>
        <div {...stylex.props(styles.bandInner)}>
          <Flex direction="column" gap="2xl">
            <Select
              label="Series"
              description="Where this collection is published — followers of the series receive it."
              size="lg"
              selectedKey={selectedPubUri}
              onSelectionChange={(key) => {
                const value = String(key);
                if (value === CREATE_PUBLICATION) {
                  setCreatePubOpen(true);
                } else {
                  setSelectedPubUri(value);
                }
              }}
              items={[
                ...pubOptions.map((pub) => ({ id: pub.uri, label: pub.name })),
                { id: CREATE_PUBLICATION, label: "＋ New series…" },
              ]}
            >
              {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
            </Select>

            <TextField
              label="Title"
              placeholder="e.g. The Spring Reading Issue"
              value={title}
              onChange={setTitle}
              isRequired
              size="lg"
            />

            <Flex direction="column" gap="md">
              <Label size="lg">Cover</Label>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt="Collection cover"
                  {...stylex.props(styles.coverPreview)}
                />
              ) : null}
              <Flex align="center" gap="md">
                <FileDropZone
                  acceptedFileTypes={["image/*"]}
                  isDisabled={coverMutation.isPending}
                  onAddFiles={(files) => {
                    if (files[0]) onCoverFile(files[0]);
                  }}
                  style={styles.dropZone}
                >
                  <ImagePlus size={16} aria-hidden />
                  <span>
                    {coverMutation.isPending
                      ? "Uploading…"
                      : coverUrl
                        ? "Drop or choose a new image to replace"
                        : "Drop an image here, or choose a file"}
                  </span>
                  <FileDropDefaultTrigger>
                    {coverUrl ? "Replace cover image" : null}
                  </FileDropDefaultTrigger>
                </FileDropZone>
                {coverUrl ? (
                  <Button variant="tertiary" size="lg" onPress={removeCover}>
                    Remove
                  </Button>
                ) : null}
              </Flex>
            </Flex>

            <MarkdownField
              label="Editorial"
              value={editorialBody}
              onChange={setEditorialBody}
              placeholder="Introduce the collection… (markdown supported)"
              rows={6}
              size="lg"
            />
          </Flex>
        </div>
      </div>

      <div {...stylex.props(styles.band)}>
        <div {...stylex.props(styles.bandInner)}>
          <SectionHead
            kicker={`${items.length} of ${MAX_ITEMS}`}
            title="Articles"
            action={
              <Dialog
                size="md"
                isOpen={addOpen}
                onOpenChange={(open) => {
                  setAddOpen(open);
                  if (!open) setSearch("");
                }}
                trigger={
                  <Button
                    variant="secondary"
                    size="md"
                    isDisabled={items.length >= MAX_ITEMS}
                    onPress={() => setAddOpen(true)}
                  >
                    <Plus size={16} aria-hidden /> Add an article
                  </Button>
                }
              >
                <DialogHeader>Add an article</DialogHeader>
                <DialogBody>
                  <Flex direction="column" gap="2xl">
                    <SearchField
                      aria-label="Search articles"
                      placeholder="Search by title or author, or paste a URL or at:// URI"
                      value={search}
                      onChange={setSearch}
                      size="lg"
                      // The dialog exists to search; focus the field on open.
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                    <ListBox
                      aria-label="Matching articles"
                      items={candidates}
                      selectionMode="none"
                      size="lg"
                      style={styles.addList}
                      onAction={(key) => addArticle(String(key))}
                      renderEmptyState={() =>
                        isSearching ? (
                          <Flex
                            align="center"
                            gap="sm"
                            style={styles.addSearching}
                          >
                            <ProgressCircle
                              isIndeterminate
                              size="sm"
                              aria-label="Searching"
                            />
                            <span {...stylex.props(styles.empty)}>
                              Searching…
                            </span>
                          </Flex>
                        ) : (
                          <span
                            {...stylex.props(styles.empty, styles.addEmpty)}
                          >
                            {search.trim().length === 0
                              ? "Search by title or author handle, or paste a Standard Reader URL, article URL, or at:// URI."
                              : "No matching articles."}
                          </span>
                        )
                      }
                    >
                      {(article) => (
                        <ListBoxItem id={article.uri} textValue={article.title}>
                          <ArticleResultRow article={article} />
                        </ListBoxItem>
                      )}
                    </ListBox>
                  </Flex>
                </DialogBody>
              </Dialog>
            }
          />

          {items.length === 0 ? (
            <span {...stylex.props(styles.empty)}>
              No articles yet — use “Add an article” to get started.
            </span>
          ) : (
            <div ref={listRef} {...stylex.props(styles.gridListShell)}>
              {dropSlot ? (
                <CollectionDropOverlay
                  drop={dropSlot}
                  listRef={listRef}
                  itemRefs={itemRefs}
                />
              ) : null}
              <GridList
                aria-label="Articles in collection"
                selectionMode="none"
                layout="stack"
                // Notes are text fields inside each row — typeahead and arrow
                // navigation must not steal keys meant for the textarea.
                disallowTypeAhead
                keyboardNavigationBehavior="tab"
                dragAndDropHooks={dragAndDropHooks}
                {...stylex.props(styles.gridList)}
              >
                {items.map((item, index) => (
                  <GridListItem
                    key={item.uri}
                    id={item.uri}
                    textValue={item.title}
                    ref={(el) => setItemRef(item.uri, el)}
                    {...stylex.props(
                      styles.gridListItem,
                      ...cardSlotPaddingStyles(index, items.length),
                    )}
                  >
                    {({ allowsDragging, isDragging }) => (
                      <div
                        {...stylex.props(
                          styles.cardRow,
                          isDragging && styles.cardRowDragging,
                        )}
                      >
                        <div {...stylex.props(styles.rail)}>
                          <span {...stylex.props(styles.ord)}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div {...stylex.props(styles.railCtl)}>
                            {allowsDragging ? (
                              <IconButton
                                slot="drag"
                                aria-label={`Reorder ${item.title}`}
                                size="sm"
                                variant="tertiary"
                                style={styles.dragHandle}
                              >
                                <GripVertical />
                              </IconButton>
                            ) : null}
                            <IconButton
                              aria-label="Move up"
                              size="sm"
                              variant="tertiary"
                              isDisabled={index === 0}
                              onPress={() => nudgeItem(index, -1)}
                            >
                              <ChevronUp />
                            </IconButton>
                            <IconButton
                              aria-label="Move down"
                              size="sm"
                              variant="tertiary"
                              isDisabled={index === items.length - 1}
                              onPress={() => nudgeItem(index, 1)}
                            >
                              <ChevronDown />
                            </IconButton>
                            <IconButton
                              aria-label={`Remove ${item.title}`}
                              size="sm"
                              variant="tertiary"
                              onPress={() => removeItem(item.uri)}
                            >
                              <X />
                            </IconButton>
                          </div>
                        </div>
                        <div {...stylex.props(styles.cardBody)}>
                          {item.card ? (
                            <ArticleResultRow
                              article={item.card}
                              variant="feed"
                            />
                          ) : (
                            <span {...stylex.props(styles.itemTitle)}>
                              {item.title}
                            </span>
                          )}
                          <div
                            role="group"
                            {...stylex.props(styles.noteFooter)}
                            onPointerDown={isolateNoteFieldFromRowDrag}
                            onMouseDown={isolateNoteFieldFromRowDrag}
                            onDragStart={isolateNoteFieldFromRowDrag}
                          >
                            <MarkdownField
                              label="Editor’s note"
                              value={item.note}
                              onChange={(note) => setNote(item.uri, note)}
                              placeholder="Why is this piece here? (markdown supported)"
                              rows={3}
                              size="lg"
                              variant="tertiary"
                              style={styles.noteField}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </GridListItem>
                ))}
              </GridList>
            </div>
          )}

          {error ? (
            <span {...stylex.props(styles.empty, styles.errorNote)}>
              {error instanceof Error ? error.message : "Something went wrong."}
            </span>
          ) : null}
        </div>
      </div>

      <CollectionPublicationCreateDialog
        isOpen={createPubOpen}
        onOpenChange={setCreatePubOpen}
        onCreated={(publication) => setSelectedPubUri(publication.uri)}
      />
    </div>
  );
}
