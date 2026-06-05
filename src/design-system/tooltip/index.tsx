"use client";

import type {
  TooltipProps as AriaTooltipProps,
  TooltipTriggerComponentProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  Tooltip as AriaTooltip,
  OverlayArrow,
  TooltipTrigger,
} from "react-aria-components";

import { animationDuration } from "../theme/animations.stylex";
import { uiInverted } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import { fontFamily, fontSize, lineHeight } from "../theme/typography.stylex";

const tooltipStyle = stylex.create({
  content: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    backgroundColor: uiInverted.bg,
    boxShadow: shadow["sm"],
    color: uiInverted.text1,
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["sm"],
    lineHeight: lineHeight["sm"],
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
    paddingTop: verticalSpace["xs"],

    "--origin": {
      ":is([data-placement=bottom])": "translateY(-4px)",
      ":is([data-placement=left])": "translateX(4px)",
      ":is([data-placement=right])": "translateX(-4px)",
      ":is([data-placement=top])": "translateY(4px)",
    },
    opacity: {
      default: 1,
      ":is([data-entering])": 0,
      ":is([data-exiting])": 0,
    },
    transform: {
      ":is([data-entering])": "scale(0.9) var(--origin)",
      ":is([data-exiting])": "scale(0.9) var(--origin)",
    },
    transitionDuration: animationDuration.default,
    transitionProperty: "transform, opacity",
  },
  caret: {
    fill: uiInverted.bg,
    display: "flex",
  },
  arrow: {
    transform: {
      [":is([data-placement=bottom] *)"]: "rotate(180deg)",
      [":is([data-placement=left] *)"]: "rotate(90deg)",
      [":is([data-placement=right] *)"]: "rotate(-90deg)",
      [":is([data-placement=top] *)"]: "rotate(0deg)",
    },
  },
});

interface TooltipProps
  extends
    TooltipTriggerComponentProps,
    Pick<AriaTooltipProps, "crossOffset" | "placement" | "shouldFlip"> {
  text: string;
  children: React.ReactNode;
}

export const Tooltip = ({
  text,
  children,
  crossOffset,
  placement,
  shouldFlip,
  ...triggerProps
}: TooltipProps) => {
  return (
    <TooltipTrigger {...triggerProps}>
      {children}

      <AriaTooltip
        {...stylex.props(tooltipStyle.content)}
        crossOffset={crossOffset}
        containerPadding={8}
        placement={placement}
        offset={8}
        shouldFlip={shouldFlip}
      >
        <OverlayArrow {...stylex.props(tooltipStyle.caret)}>
          <svg
            width={8}
            height={8}
            viewBox="0 0 8 8"
            {...stylex.props(tooltipStyle.arrow)}
          >
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        </OverlayArrow>
        {text}
      </AriaTooltip>
    </TooltipTrigger>
  );
};
