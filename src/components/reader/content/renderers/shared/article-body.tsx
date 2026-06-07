"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";

export function ArticleBody({
  hasHero,
  children,
}: {
  hasHero: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      {...stylex.props(
        articleBodyStyles.body,
        hasHero ? articleBodyStyles.bodyAfterHero : undefined,
      )}
    >
      {children}
    </div>
  );
}
