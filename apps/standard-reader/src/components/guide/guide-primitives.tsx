"use client";

import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Children } from "react";

import { guideStyles } from "./guide-page.stylex";

/**
 * An aside — a tip, a caveat, or a "you don't have to do this" reassurance.
 * Kept visually quiet: the guide is prose first.
 */
export function GuideCallout({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside {...stylex.props(guideStyles.callout)}>
      <div {...stylex.props(guideStyles.calloutTitle)}>{title}</div>
      <div {...stylex.props(guideStyles.calloutBody)}>{children}</div>
    </aside>
  );
}

/**
 * A numbered walkthrough. Renders a real `<ol>` — the numbers come from the
 * list, not from copy, so a screen reader announces "3 of 5" rather than
 * reading a decorative digit.
 */
export function GuideSteps({ children }: { children: ReactNode }) {
  return (
    <ol {...stylex.props(guideStyles.steps)}>
      {Children.map(children, (child, index) => (
        <li {...stylex.props(guideStyles.step)}>
          <span {...stylex.props(guideStyles.stepMarker)} aria-hidden="true">
            {index + 1}
          </span>
          <div {...stylex.props(guideStyles.stepBody)}>{child}</div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The name of a control as it appears in the app. Set apart from the prose so
 * "press Follow" can't be misread as a sentence, without borrowing the
 * developer docs' monospace `<code>` treatment — this is a button, not code.
 */
export function UiLabel({ children }: { children: ReactNode }) {
  return <b {...stylex.props(guideStyles.uiLabel)}>{children}</b>;
}
