"use client";

import * as stylex from "@stylexjs/stylex";
import { createContext, use, useEffect, useState } from "react";
import { useHover } from "react-aria";

import type { StyleXComponentProps } from "../theme/types";

import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontSize } from "../theme/typography.stylex";

export interface TocEntry {
  value: string;
  depth: number;
  id?: string;
  children?: Array<TocEntry>;
}

export type Toc = Array<TocEntry>;

const ActiveHeaderIdContext = createContext<string | null>(null);
const LevelContext = createContext(1);

const styles = stylex.create({
  wrapper: {
    gap: gap["md"],
    overflow: "auto",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    paddingBottom: verticalSpace["12xl"],
    paddingTop: verticalSpace["10xl"],
    width: "240px",
  },
  itemList: {
    marginBottom: 0,
    marginLeft: 0,
    listStyle: "none",
    marginRight: 0,
    marginTop: 0,
    paddingLeft: 0,
  },
  item: {
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component1,
      ":is([data-hovered])::before": primaryColor.solid1,
    },
    color: {
      default: uiColor.text1,
    },
    display: "flex",
    fontSize: fontSize["sm"],
    position: "relative",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "color, border-left-color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: "ease-in-out",
    borderLeftColor: {
      default: uiColor.border1,
    },
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    height: sizeSpace["3xl"],

    "::before": {
      content: "''",
      position: "absolute",
      bottom: 0,
      left: 0,
      top: 0,
      width: 1,
    },
  },
  level: (level: number) => ({
    paddingLeft: `calc(${horizontalSpace["2xl"]} * ${level.toString()})`,
  }),
  active: {
    color: primaryColor.solid2,
    borderLeftColor: primaryColor.solid1,

    "::before": {
      backgroundColor: primaryColor.solid1,
      content: "''",
      position: "absolute",
      bottom: 0,
      left: 0,
      top: 0,
      width: 1,
    },
  },
});

function TocItem({ id, value, children }: TocEntry) {
  const level = use(LevelContext);
  const activeHeaderId = use(ActiveHeaderIdContext);
  const { hoverProps, isHovered } = useHover({});

  return (
    <li key={id}>
      <a
        href={`#${id ?? ""}`}
        data-hovered={isHovered || undefined}
        {...hoverProps}
        {...stylex.props(
          styles.item,
          styles.level(level),
          activeHeaderId === id && styles.active,
        )}
      >
        {value}
      </a>
      {children && (
        <LevelContext value={level + 1}>
          <ul {...stylex.props(styles.itemList)}>
            {children.map((child) => (
              <TocItem key={child.id} {...child} />
            ))}
          </ul>
        </LevelContext>
      )}
    </li>
  );
}

/**
 * TableOfContents component props.
 */
export interface TableOfContentsProps extends StyleXComponentProps<{
  toc: Toc;
}> {}

/**
 * A table of contents component that displays a navigation tree based on document headings.
 * Automatically highlights the currently visible heading using IntersectionObserver.
 */
export function TableOfContents({ toc, style }: TableOfContentsProps) {
  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target.id) {
          setActiveHeaderId(entry.target.id);
        }
      }
    });

    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

    for (const heading of headings) {
      observer.observe(heading);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <ActiveHeaderIdContext value={activeHeaderId}>
      <nav {...stylex.props(styles.wrapper, style)}>
        <LevelContext value={1}>
          <ul {...stylex.props(styles.itemList)}>
            {toc.map((item) => (
              <TocItem key={item.id} {...item} />
            ))}
          </ul>
        </LevelContext>
      </nav>
    </ActiveHeaderIdContext>
  );
}
