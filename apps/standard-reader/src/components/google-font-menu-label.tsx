"use client";

import { fontSize } from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";

import { googleFontFamilyStyle } from "#/lib/google-fonts";

import { ReadingCustomFontLoader } from "./reading-custom-font-loader";

const styles = stylex.create({
  label: {
    fontSize: fontSize.lg,
  },
});

export function GoogleFontMenuLabel({ name }: { name: string }) {
  const previewStyle: CSSProperties = {
    fontFamily: googleFontFamilyStyle(name),
  };

  return (
    <>
      <ReadingCustomFontLoader family={name} variant="preview" />
      <span {...stylex.props(styles.label)} style={previewStyle}>
        {name}
      </span>
    </>
  );
}
