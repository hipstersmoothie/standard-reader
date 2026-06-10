"use client";

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

  return <div {...readingBodyStyleProps(preference, hasHero)}>{children}</div>;
}
