"use client";

import { ReadingCustomFontLoader } from "#/components/reading-custom-font-loader";
import { readingCustomFontFamily } from "#/lib/reading-typography";
import { useReadingTypography } from "#/lib/use-reading-typography";

import { readingBodyStyleProps } from "../../body-styles";

export function ArticleBody({
  hasHero,
  children,
}: {
  hasHero: boolean;
  children: React.ReactNode;
}) {
  const { preference } = useReadingTypography();

  return (
    <>
      <ReadingCustomFontLoader family={readingCustomFontFamily(preference)} />
      {/* `dir="auto"` — article text is author content in an unknown language
          and must NOT inherit the UI direction from <html>. The browser picks
          the direction from the first strong directional character, so an
          English article stays LTR under an Arabic UI and an Arabic article
          renders RTL under an English one. Without this, `float: inline-start`
          on the drop cap resolves to `right` and the opening letter lands on
          the wrong side. */}
      <div dir="auto" {...readingBodyStyleProps(preference, hasHero)}>
        {children}
      </div>
    </>
  );
}
