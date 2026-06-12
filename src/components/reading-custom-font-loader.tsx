"use client";

import {
  googleFontsPreviewStylesheetUrl,
  googleFontsStylesheetUrl,
} from "#/lib/google-fonts";
import { useLayoutEffect } from "react";

function linkIdForFamily(family: string, variant: "full" | "preview"): string {
  const slug = family.trim().toLowerCase().replaceAll(/\s+/g, "-");
  return variant === "preview"
    ? `google-font-preview-${slug}`
    : `google-font-${slug}`;
}

export function ReadingCustomFontLoader({
  family,
  variant = "full",
}: {
  family: string | null | undefined;
  variant?: "full" | "preview";
}) {
  useLayoutEffect(() => {
    const normalized = family?.trim();
    if (!normalized) return;

    const id = linkIdForFamily(normalized, variant);
    const existing = document.querySelector(`#${id}`);
    if (existing instanceof HTMLLinkElement) {
      return;
    }

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      variant === "preview"
        ? googleFontsPreviewStylesheetUrl(normalized)
        : googleFontsStylesheetUrl(normalized);
    document.head.append(link);
  }, [family, variant]);

  return null;
}
