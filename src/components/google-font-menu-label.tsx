"use client";

import type { CSSProperties } from "react";

import * as stylex from "@stylexjs/stylex";
import { googleFontFamilyStyle } from "#/lib/google-fonts";

import { fontSize } from "../design-system/theme/typography.stylex";
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
