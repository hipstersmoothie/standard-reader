"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { toasts } from "@standard-reader/design-system/toast";
import { marginApi } from "#/integrations/tanstack-query/api-margin.functions";
import { saveDraftApi } from "#/integrations/tanstack-query/api-save-draft.functions";
import { sembleApi } from "#/integrations/tanstack-query/api-semble.functions";

const APP_LABEL = { margin: "Margin", semble: "Semble" } as const;

/**
 * Finishes a "Save to Margin/Semble" that needed an OAuth scope upgrade. The
 * upgrade flow's redirect target is the page the reader was already on (see
 * `save-to-collection-dialog.tsx`), with `?save=<draftId>` appended — no
 * dedicated `/margin/return` / `/semble/return` landing page. This component
 * watches for that param on mount, consumes the draft (single-use), performs
 * the save, and cleans the URL, so the reader just lands back on the article
 * they were reading with a confirmation toast.
 *
 * Mount once per article page (in `article-view.tsx`); the draft's
 * `targetApp` field — not this component's context — decides which API the
 * save is dispatched to.
 */
export function SaveDraftConsumer() {
  const queryClient = useQueryClient();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    const url = new URL(globalThis.location.href);
    const draftId = url.searchParams.get("save");
    if (!draftId) return;
    consumedRef.current = true;

    // Strip the one-time params immediately so a refresh (or the toast
    // re-rendering this component) can't re-trigger the consume.
    url.searchParams.delete("save");
    url.searchParams.delete("loginSuccess");
    url.searchParams.delete("handle");
    url.searchParams.delete("avatar");
    globalThis.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    void (async () => {
      try {
        const draft = await saveDraftApi.consumeSaveDraft({
          data: { draftId },
        });
        if (!draft) {
          toasts.add(
            {
              variant: "critical",
              title: "That save link expired",
              description:
                "Drafts last 15 minutes — try saving again from the share menu.",
            },
            { timeout: 5000 },
          );
          return;
        }

        const app = draft.targetApp === "semble" ? "semble" : "margin";
        const collectionFields = draft.collectionUri
          ? { collectionUri: draft.collectionUri }
          : { newCollectionName: draft.newCollectionName ?? "" };

        if (app === "margin") {
          await marginApi.saveArticleToMarginCollection({
            data: {
              ...collectionFields,
              url: draft.url,
              title: draft.title,
              ...(draft.passage ? { passage: draft.passage } : {}),
              ...(draft.description ? { note: draft.description } : {}),
            },
          });
        } else {
          await sembleApi.saveArticleToSembleCollection({
            data: {
              ...collectionFields,
              ...(draft.collectionCid
                ? { collectionCid: draft.collectionCid }
                : {}),
              url: draft.url,
              title: draft.title,
              ...(draft.description ? { description: draft.description } : {}),
              ...(draft.author ? { author: draft.author } : {}),
              ...(draft.siteName ? { siteName: draft.siteName } : {}),
              ...(draft.imageUrl ? { imageUrl: draft.imageUrl } : {}),
            },
          });
        }

        toasts.add(
          {
            variant: "success",
            title: "Saved",
            description: `Saved to ${APP_LABEL[app]}.`,
          },
          { timeout: 3000 },
        );
        void queryClient.invalidateQueries({
          queryKey: [app, "collections"],
        });
      } catch (error) {
        toasts.add(
          {
            variant: "critical",
            title: "Could not finish saving",
            description:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
          },
          { timeout: 5000 },
        );
      }
    })();
  }, [queryClient]);

  return null;
}
