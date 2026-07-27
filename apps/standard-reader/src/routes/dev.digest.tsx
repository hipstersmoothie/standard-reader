"use client";

import {
  criticalColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { UserHandleAutocomplete } from "#/components/user-handle-autocomplete";

/** Dev-only tool to preview a reader's weekly digest. 404s in production. */
export const Route = createFileRoute("/dev/digest")({
  beforeLoad: () => {
    if (import.meta.env.PROD) {
      throw notFound();
    }
  },
  component: DevDigestPreview,
});

interface PreviewMeta {
  handle: string;
  articleCount: number;
  recommendationCount: number;
  subject: string;
}

function DevDigestPreview() {
  const [value, setValue] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPreview = async (handle: string, did?: string) => {
    setLoading(true);
    setErrorMessage(null);
    setHtml(null);
    setMeta(null);
    try {
      const qs = did
        ? `did=${encodeURIComponent(did)}`
        : `handle=${encodeURIComponent(handle)}`;
      const res = await fetch(`/api/dev/digest-preview?${qs}`);
      if (!res.ok) {
        setErrorMessage(`${res.status}: ${await res.text()}`);
        return;
      }
      setHtml(await res.text());
      setMeta({
        articleCount: Number(res.headers.get("x-digest-article-count") ?? 0),
        handle,
        recommendationCount: Number(
          res.headers.get("x-digest-recommendation-count") ?? 0,
        ),
        subject: decodeURIComponent(res.headers.get("x-digest-subject") ?? ""),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Weekly digest preview</h1>
        <p {...stylex.props(styles.subtitle)}>
          Dev-only. Pick a reader to render their weekly digest exactly as it
          would be emailed.
        </p>
      </div>

      <UserHandleAutocomplete
        value={value}
        onValueChange={setValue}
        onSelect={(handle, did) => void loadPreview(handle, did)}
        aria-label="Reader handle"
        placeholder="handle.bsky.social"
      />

      {loading ? <p {...stylex.props(styles.meta)}>Loading…</p> : null}
      {errorMessage ? (
        <p {...stylex.props(styles.error)}>{errorMessage}</p>
      ) : null}
      {meta ? (
        <p {...stylex.props(styles.meta)}>
          {meta.handle} · {meta.articleCount} articles ·{" "}
          {meta.recommendationCount} recommendations · “{meta.subject}”
          {meta.articleCount === 0 ? " · empty (would not send)" : ""}
        </p>
      ) : null}

      {html ? (
        <iframe
          title="Digest preview"
          srcDoc={html}
          {...stylex.props(styles.frame)}
        />
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    marginInline: "auto",
    maxWidth: "48rem",
    paddingBottom: verticalSpace["3xl"],
    paddingInline: horizontalSpace.lg,
    paddingTop: verticalSpace["3xl"],
    rowGap: gap.lg,
    width: "100%",
  },
  error: {
    color: criticalColor.text2,
    fontSize: fontSize.sm,
  },
  frame: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    height: "80vh",
    width: "100%",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xs,
  },
  meta: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
  subtitle: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
  title: {
    color: uiColor.text2,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
});
