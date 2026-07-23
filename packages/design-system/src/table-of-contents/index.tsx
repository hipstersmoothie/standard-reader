"use client";

import * as stylex from "@stylexjs/stylex";
import { createContext, use, useEffect, useState } from "react";
import { useFocusRing, useHover } from "react-aria";

import { animationDuration } from "../theme/animations.stylex";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
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
    listStyle: "none",
    marginBottom: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
    paddingInlineStart: 0,
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
      default: "color, border-inline-start-color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: "ease-in-out",
    borderInlineStartColor: {
      default: uiColor.border1,
    },
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    height: sizeSpace["3xl"],
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",

    "::before": {
      content: "''",
      position: "absolute",
      bottom: 0,
      insetInlineStart: 0,
      top: 0,
      width: 1,
    },
  },
  level: (level: number) => ({
    paddingInlineStart: `calc(${horizontalSpace["2xl"]} * ${level.toString()})`,
  }),
  active: {
    color: primaryColor.solid2,
    borderInlineStartColor: primaryColor.solid1,

    "::before": {
      backgroundColor: primaryColor.solid1,
      content: "''",
      position: "absolute",
      bottom: 0,
      insetInlineStart: 0,
      top: 0,
      width: 1,
    },
  },
});

function TocItem({ id, value, children }: TocEntry) {
  const level = use(LevelContext);
  const activeHeaderId = use(ActiveHeaderIdContext);
  const { hoverProps, isHovered } = useHover({});
  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    <li key={id}>
      <a
        href={`#${id ?? ""}`}
        data-hovered={isHovered || undefined}
        data-focus-visible={isFocusVisible || undefined}
        {...hoverProps}
        {...focusProps}
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
