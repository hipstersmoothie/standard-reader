import { isMac as getIsMac } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";

import type { StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, lineHeight, tracking } from "../theme/typography.stylex";

const styles = stylex.create({
  kbd: {
    borderColor: uiColor.border2,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: "1px",

    cornerShape: "squircle",
    backgroundColor: uiColor.component2,
    boxShadow: `0 2px 0 1px ${uiColor.border2}`,
    color: uiColor.text1,
    fontFamily: fontFamily["sans"],
    fontSize: "0.75em",
    letterSpacing: tracking["widest"],
    lineHeight: lineHeight["none"],
    position: "relative",
    paddingBottom: verticalSpace["xxs"],
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
    paddingTop: verticalSpace["xxs"],
    top: "-1px",
  },
});

export interface KbdProps extends StyleXComponentProps<
  Omit<React.ComponentProps<"kbd">, "children">
> {
  children: string;
}

export function Kbd({ children, style, ...props }: KbdProps) {
  const isMac = getIsMac();
  let finalString = "";

  for (const char of children.split("+")) {
    switch (char) {
      case "MetaOrCtrl": {
        finalString += isMac ? "⌘" : "Ctrl";
        break;
      }
      case "Shift": {
        finalString += "⇧";
        break;
      }
      case "Plus": {
        finalString += "+";
        break;
      }
      case "Enter": {
        finalString += "↵";
        break;
      }
      case "Tab": {
        finalString += "⇥";
        break;
      }
      case "Backspace": {
        finalString += "⌫";
        break;
      }
      case "Delete": {
        finalString += "⌦";
        break;
      }
      case "ArrowLeft": {
        finalString += "←";
        break;
      }
      case "ArrowRight": {
        finalString += "→";
        break;
      }
      case "ArrowUp": {
        finalString += "↑";
        break;
      }
      case "ArrowDown": {
        finalString += "↓";
        break;
      }
      default: {
        finalString += char;
      }
    }
  }

  return (
    <kbd
      {...stylex.props(styles.kbd, style)}
      {...props}
      // The keyboard shortcut will change
      suppressHydrationWarning
    >
      {finalString}
    </kbd>
  );
}
