"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@standard-reader/design-system/button";
import { Checkbox } from "@standard-reader/design-system/checkbox";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { Link } from "@standard-reader/design-system/link";
import { Radio, RadioGroup } from "@standard-reader/design-system/radio";
import { Separator } from "@standard-reader/design-system/separator";
import { TextArea } from "@standard-reader/design-system/text-area";
import { TextField } from "@standard-reader/design-system/text-field";
import { criticalColor, uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { fontFamily, fontSize } from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import { hasMarginScope, hasSembleScope } from "#/integrations/auth/scope";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { marginApi } from "#/integrations/tanstack-query/api-margin.functions";
import { saveDraftApi } from "#/integrations/tanstack-query/api-save-draft.functions";
import { sembleApi } from "#/integrations/tanstack-query/api-semble.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { isAtprotoScopeMissingError } from "#/lib/atproto/scope-error";
import { truncateQuoteForDisplay } from "#/lib/quote-share";

const NEW_COLLECTION_VALUE = "__new__";

const APP_LABEL = { margin: "Margin", semble: "Semble" } as const;
const APP_HOMEPAGE = {
  margin: "https://margin.at",
  semble: "https://semble.so",
} as const;
/**
 * Namespace prefix (not a single collection name) used to detect a missing
 * scope on any write in the app's flow — creating the collection itself
 * (`at.margin.collection` / `network.cosmik.collection`) fails with the same
 * `ScopeMissingError` shape as the note/card write, and a reader who picks
 * "+ New collection…" hits that path first.
 */
const MISSING_COLLECTION = {
  margin: "at.margin.",
  semble: "network.cosmik.",
} as const;

const styles = stylex.create({
  trigger: { display: "none" },
  body: { width: "100%" },
  content: { width: "100%" },
  footerCheckbox: {
    flexGrow: 1,
  },
  error: {
    color: criticalColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  empty: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
});

export interface SaveToCollectionDialogProps {
  app: "margin" | "semble";
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  articleTitle: string;
  /** Lazily resolve the Standard Reader article URL (the default save
   * target). A getter (not a plain string) so it's only evaluated on submit —
   * safe to pass `() => globalThis.location.href` from a component that also
   * renders during SSR. */
  getStandardReaderUrl: () => string;
  /** The original article's URL, when the article has one. Enables the
   * SR-vs-original link toggle. */
  originalUrl?: string | null;
  /** Semble-only: article summary, used as the saved card's description. */
  articleDescription?: string | null;
  /** Semble-only: article author/byline, used as the saved card's author. */
  articleAuthor?: string | null;
  /** Semble-only: publication name, used as the saved card's site name. */
  articleSiteName?: string | null;
  /** Semble-only: article hero image, used as the saved card's image. */
  articleImageUrl?: string | null;
  /** Present when saving a highlighted passage from the section menu. */
  passage?: string;
  /** Semble-only: lazily create (or reuse) the quote-share deep link for the
   * selected passage. Required when `passage` is set and `app === "semble"`. */
  ensureQuoteShareUrl?: () => Promise<string | null>;
}

/**
 * Shared "Save to Margin" / "Save to Semble" dialog, opened from both the
 * article share menu (whole article) and the text-selection toolbar's share
 * menu (a highlighted passage). Lets the reader pick an existing collection
 * or create a new one, then either saves immediately (scope already granted)
 * or stashes a draft and kicks off the progressive OAuth scope upgrade —
 * mirrors `feedback-dialog.tsx` / `atstore-review-prompt.tsx`.
 */
export function SaveToCollectionDialog({
  app,
  isOpen,
  onOpenChange,
  articleTitle,
  getStandardReaderUrl,
  originalUrl,
  articleDescription,
  articleAuthor,
  articleSiteName,
  articleImageUrl,
  passage,
  ensureQuoteShareUrl,
}: SaveToCollectionDialogProps) {
  const { t } = useLingui();
  const appLabel = APP_LABEL[app];
  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [useOriginalUrl, setUseOriginalUrl] = useState(false);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const { data: session } = useQuery(user.getSessionQueryOptions);
  // `enabled: isOpen` — this dialog is always mounted (even while closed), so
  // an unconditional useQuery would fetch the collection list the instant the
  // article page loads, possibly before sign-in/scope state has settled, then
  // sit cached (staleTime below) and serve that stale/empty result the next
  // time the dialog opens. Gating on `isOpen` defers the fetch to the moment
  // the reader actually opens the picker.
  const collectionsQuery = useQuery({
    ...(app === "margin"
      ? marginApi.getMarginCollectionsQueryOptions()
      : sembleApi.getSembleCollectionsQueryOptions()),
    enabled: isOpen,
  });
  const collections = useMemo(
    () => collectionsQuery.data?.collections ?? [],
    [collectionsQuery.data],
  );

  // Reset the form whenever the dialog is closed so a reopen is clean.
  useEffect(() => {
    if (!isOpen) {
      setSelected("");
      setNewName("");
      setUseOriginalUrl(false);
      setNote("");
    }
  }, [isOpen]);

  // Default to the first existing collection once the list loads, if the
  // reader hasn't already chosen something. When there are no collections
  // yet, skip the picker entirely and go straight to "new collection" mode.
  useEffect(() => {
    if (!isOpen) return;
    if (selected) return;
    if (collectionsQuery.isLoading) return;
    if (collections.length > 0) {
      setSelected(collections[0].uri);
    } else {
      setSelected(NEW_COLLECTION_VALUE);
    }
  }, [collections, collectionsQuery.isLoading, isOpen, selected]);

  const hasScope =
    app === "margin"
      ? hasMarginScope(session?.grantedScope ?? null)
      : hasSembleScope(session?.grantedScope ?? null);
  const needsScopeUpgrade = !hasScope;

  const submitOrUpgrade = useMutation({
    mutationFn: async (): Promise<
      { authorizationUrl: string } | { ok: true }
    > => {
      const isNew = selected === NEW_COLLECTION_VALUE;
      const trimmedNewName = newName.trim();
      if (!selected) {
        throw new Error("Choose a collection.");
      }
      if (isNew && !trimmedNewName) {
        throw new Error("Name your new collection.");
      }

      let url =
        !passage && useOriginalUrl && originalUrl
          ? originalUrl
          : getStandardReaderUrl();

      if (passage && app === "semble") {
        const quoteUrl = await ensureQuoteShareUrl?.();
        if (!quoteUrl) {
          throw new Error("Couldn't create a share link for this passage.");
        }
        url = quoteUrl;
      }

      const collectionFields = isNew
        ? { newCollectionName: trimmedNewName }
        : { collectionUri: selected };

      // Semble cards have no selector/highlight concept, so when saving a
      // passage the quote itself is the most useful description; otherwise
      // fall back to the article's own summary.
      const sembleMetadata = {
        ...(passage
          ? { description: truncateQuoteForDisplay(passage) }
          : articleDescription
            ? { description: articleDescription }
            : {}),
        ...(articleAuthor ? { author: articleAuthor } : {}),
        ...(articleSiteName ? { siteName: articleSiteName } : {}),
        ...(!passage && articleImageUrl ? { imageUrl: articleImageUrl } : {}),
      };

      const trimmedNote = note.trim();

      try {
        if (app === "margin") {
          await marginApi.saveArticleToMarginCollection({
            data: {
              ...collectionFields,
              url,
              title: articleTitle,
              ...(passage ? { passage } : {}),
              ...(trimmedNote ? { note: trimmedNote } : {}),
            },
          });
        } else {
          await sembleApi.saveArticleToSembleCollection({
            data: {
              ...collectionFields,
              url,
              title: articleTitle,
              ...sembleMetadata,
            },
          });
        }
        return { ok: true };
      } catch (error) {
        if (!isAtprotoScopeMissingError(error, MISSING_COLLECTION[app])) {
          throw error;
        }
        // Scope missing — stash the draft, then kick off the upgrade flow.
        // `SaveDraftConsumer` (mounted on the article page) consumes the
        // draft and performs the save once OAuth redirects back here — no
        // dedicated return page, the reader just lands back on this article.
        const draft = await saveDraftApi.createSaveDraft({
          data: {
            targetApp: app,
            ...collectionFields,
            url,
            title: articleTitle,
            ...(app === "semble" ? sembleMetadata : {}),
            ...(app === "margin" && trimmedNote
              ? { description: trimmedNote }
              : {}),
            ...(passage && app === "margin"
              ? { passage, motivation: "highlighting" as const }
              : {}),
          },
        });
        const returnUrl = new URL(globalThis.location.href);
        returnUrl.searchParams.set("save", draft.id);
        const redirect = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
        const result =
          app === "margin"
            ? await auth.upgradeToMargin({ data: { redirect } })
            : await auth.upgradeToSemble({ data: { redirect } });
        return { authorizationUrl: result.authorizationUrl };
      }
    },
    onSuccess: (result) => {
      if ("authorizationUrl" in result) {
        globalThis.location.href = result.authorizationUrl;
        return;
      }
      onOpenChange(false);
      const savedName =
        selected === NEW_COLLECTION_VALUE
          ? newName.trim()
          : (collections.find((c) => c.uri === selected)?.name ??
            t`your collection`);
      toasts.add(
        {
          variant: "success",
          title: t`Saved`,
          description: t`Saved to ${savedName} on ${appLabel}.`,
        },
        { timeout: 3000 },
      );
      void queryClient.invalidateQueries({
        queryKey: [app === "margin" ? "margin" : "semble", "collections"],
      });
    },
    onError: (error) => {
      toasts.add(
        {
          variant: "critical",
          title: t`Could not save to ${appLabel}`,
          description:
            error instanceof Error
              ? error.message
              : t`Something went wrong. Please try again.`,
        },
        { timeout: 5000 },
      );
    },
  });

  const error = submitOrUpgrade.error;
  const canSubmit =
    selected === NEW_COLLECTION_VALUE
      ? newName.trim().length > 0
      : selected.length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          submitOrUpgrade.reset();
        }
      }}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden {...stylex.props(styles.trigger)} />}
    >
      <DialogHeader>
        <Trans>Save to {appLabel}</Trans>
      </DialogHeader>
      <DialogDescription>
        <Trans>
          Saves a link to your{" "}
          <Link
            href={APP_HOMEPAGE[app]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {appLabel}
          </Link>{" "}
          collection.
        </Trans>
        {needsScopeUpgrade ? (
          <>
            {" "}
            <Trans>You may be asked to grant permission the first time.</Trans>
          </>
        ) : null}
      </DialogDescription>
      <Separator />
      <DialogBody style={styles.body}>
        <Flex direction="column" gap="2xl" style={styles.content}>
          {collectionsQuery.isLoading ? (
            <span {...stylex.props(styles.empty)}>
              <Trans>Loading collections…</Trans>
            </span>
          ) : collections.length > 0 ? (
            <RadioGroup
              aria-label={t`Collection`}
              size="lg"
              value={selected}
              onChange={setSelected}
            >
              {collections.map((c) => (
                <Radio key={c.uri} value={c.uri}>
                  {c.name}
                </Radio>
              ))}
              <Radio value={NEW_COLLECTION_VALUE}>
                <Trans>New collection…</Trans>
              </Radio>
            </RadioGroup>
          ) : null}

          {selected === NEW_COLLECTION_VALUE ? (
            <TextField
              label={t`Collection name`}
              value={newName}
              onChange={setNewName}
              placeholder={t`e.g. To Read`}
              isRequired
              style={styles.content}
            />
          ) : null}

          {app === "margin" ? (
            <TextArea
              label={t`Note`}
              aria-label={t`Note`}
              placeholder={t`Optional: add a note about why you're saving this`}
              value={note}
              onChange={setNote}
              rows={3}
              autosize={false}
              style={styles.content}
            />
          ) : null}

          {error ? (
            <span {...stylex.props(styles.error)}>
              {error instanceof Error
                ? error.message
                : t`Something went wrong.`}
            </span>
          ) : null}
        </Flex>
      </DialogBody>
      <DialogFooter>
        {!passage && originalUrl ? (
          <Checkbox
            style={styles.footerCheckbox}
            isSelected={useOriginalUrl}
            onChange={setUseOriginalUrl}
          >
            <Trans>Use original link</Trans>
          </Checkbox>
        ) : null}
        <Button
          variant="primary"
          isDisabled={!canSubmit}
          isPending={submitOrUpgrade.isPending}
          onPress={() => submitOrUpgrade.mutate()}
        >
          <Trans>Save</Trans>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
