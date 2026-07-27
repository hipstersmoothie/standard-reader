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
import { useEffect, useState } from "react";

/** Dev-only tool to preview the digest welcome email. 404s in production. */
export const Route = createFileRoute("/dev/welcome-email")({
  beforeLoad: () => {
    if (import.meta.env.PROD) {
      throw notFound();
    }
  },
  component: DevWelcomeEmailPreview,
});

function DevWelcomeEmailPreview() {
  const [name, setName] = useState("Ada Lovelace");
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const qs = name.trim()
          ? `?name=${encodeURIComponent(name.trim())}`
          : "";
        const res = await fetch(`/api/dev/welcome-preview${qs}`);
        if (cancelled) return;
        if (!res.ok) {
          setErrorMessage(`${res.status}: ${await res.text()}`);
          setHtml(null);
          return;
        }
        setHtml(await res.text());
        setSubject(
          decodeURIComponent(res.headers.get("x-welcome-subject") ?? ""),
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // Debounce so typing a name doesn't refetch on every keystroke.
    const t = setTimeout(() => void load(), 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name]);

  return (
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Digest welcome email preview</h1>
        <p {...stylex.props(styles.subtitle)}>
          Dev-only. This is the one-time email sent when a reader turns on the
          weekly digest. Edit the greeting name (clear it to preview the generic
          greeting).
        </p>
      </div>

      <label {...stylex.props(styles.field)}>
        <span {...stylex.props(styles.fieldLabel)}>Greeting name</span>
        <input
          {...stylex.props(styles.input)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="(none — generic greeting)"
        />
      </label>

      {loading ? <p {...stylex.props(styles.meta)}>Loading…</p> : null}
      {errorMessage ? (
        <p {...stylex.props(styles.error)}>{errorMessage}</p>
      ) : null}
      {subject ? (
        <p {...stylex.props(styles.meta)}>Subject: “{subject}”</p>
      ) : null}

      {html ? (
        <iframe
          title="Welcome email preview"
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
  field: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xs,
  },
  fieldLabel: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
  input: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text2,
    fontSize: fontSize.base,
    paddingBlock: verticalSpace.xs,
    paddingInline: horizontalSpace.sm,
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
