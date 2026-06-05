import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
} from "../theme/types";

import { SizeContext } from "../context";
import { animationDuration } from "./animations.stylex";
import {
  criticalColor,
  successColor,
  uiColor,
  warningColor,
} from "./color.stylex";
import { radius } from "./radius.stylex";
import { ui } from "./semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
} from "./semantic-spacing.stylex";
import { fontSize, fontWeight, lineHeight } from "./typography.stylex";
import { blue } from "./colors/blue.stylex";

const styles = stylex.create({
  field: {
    gap: gap["md"],
    display: "flex",
    flexDirection: "column",
  },
  addon: {
    boxSizing: "border-box",
    color: ui.textDim,
    flexShrink: 0,
    height: "100%",

    gap: gap["md"],
    alignItems: "center",
    display: "flex",
    justifyContent: "center",

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  addonSm: {
    paddingLeft: { ":first-child": horizontalSpace["sm"] },
    paddingRight: {
      ":first-child": horizontalSpace["xs"],
      ":last-child": horizontalSpace["xs"],
    },
  },
  addonMd: {
    paddingLeft: { ":first-child": horizontalSpace["lg"] },
    paddingRight: {
      ":first-child": horizontalSpace["md"],
      ":last-child": horizontalSpace["md"],
    },
  },
  addonLg: {
    paddingLeft: { ":first-child": horizontalSpace["xl"] },
    paddingRight: {
      ":first-child": horizontalSpace["md"],
      ":last-child": horizontalSpace["md"],
    },
  },
  validationIcon: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  },
  invalidIcon: {
    color: criticalColor.text1,
  },
  validIcon: {
    color: successColor.text1,
  },
  warningIcon: {
    color: warningColor.text1,
  },
  inputWrapper: {
    borderRadius: radius.md,
    borderWidth: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,

    cornerShape: "squircle",
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    lineHeight: lineHeight["none"],
    outline: "none",
  },
  input: {
    borderWidth: 0,
    outline: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    boxSizing: "border-box",
    color: {
      default: "inherit",
      ":is(::placeholder,[data-placeholder])": uiColor.text1,
    },
    display: "flex",
    flexGrow: 1,
    lineHeight: lineHeight["none"],
    minWidth: 0,

    appearance: {
      "::-webkit-search-cancel-button": "none",
      "::-webkit-search-decoration": "none",
    },
  },
  primary: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered]:not(:has(:is([data-invalid]))))": uiColor.border2,
      ":is([data-focus-visible],:has([data-focused][data-focus-always-visible]))":
        blue.border3,
    },
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: {
      default: uiColor.bg,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        uiColor.component1,
      ":is([data-pressed=true]):not(:disabled)": uiColor.component2,
      ":disabled": "transparent",
    },
    boxShadow: {
      ":has(:is([data-invalid]))": `0 0 0 2px ${criticalColor.component1}`,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  primaryInvalid: {
    borderColor: {
      default: criticalColor.border2,
      ":is([data-hovered])": criticalColor.border3,
      ":focus": uiColor.solid1,
    },
    backgroundColor: {
      default: criticalColor.bgSubtle,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        criticalColor.component2,
      ":disabled": "transparent",
    },
    boxShadow: `0 0 0 2px ${criticalColor.component1}`,
    color: criticalColor.text2,
  },
  primaryWarning: {
    borderColor: {
      default: warningColor.border2,
      ":is([data-hovered])": warningColor.border3,
      ":focus": uiColor.solid1,
    },
    backgroundColor: {
      default: warningColor.bgSubtle,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        warningColor.component2,
      ":disabled": "transparent",
    },
    boxShadow: `0 0 0 2px ${warningColor.component1}`,
    color: warningColor.text2,
  },
  primaryValid: {
    borderColor: {
      default: successColor.border2,
      ":is([data-hovered])": successColor.border3,
      ":focus": uiColor.solid1,
    },
    backgroundColor: {
      default: successColor.bgSubtle,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        successColor.component2,
      ":disabled": "transparent",
    },
    boxShadow: `0 0 0 2px ${successColor.component1}`,
    color: successColor.text2,
  },
  secondary: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered]:not(:has(:is([data-invalid]))))": uiColor.border2,
      ":is([data-focus-visible],:has([data-focused][data-focus-always-visible]))":
        blue.border3,
    },
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: {
      default: uiColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        uiColor.component2,
      ":is([data-pressed=true]):not(:disabled)": uiColor.component3,
      ":disabled": uiColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  secondaryInvalid: {
    borderColor: {
      default: criticalColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        criticalColor.component2,
    },
    backgroundColor: {
      default: criticalColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        criticalColor.component2,
    },
  },
  secondaryWarning: {
    borderColor: {
      default: warningColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        warningColor.component2,
    },
    backgroundColor: {
      default: warningColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        warningColor.component2,
    },
    color: warningColor.text2,
  },
  secondaryValid: {
    borderColor: {
      default: successColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        successColor.component2,
    },
    backgroundColor: {
      default: successColor.component1,
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        successColor.component2,
    },
    color: successColor.text2,
  },
  tertiary: {
    borderColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        uiColor.component2,
      ":is([data-pressed=true]):not(:disabled)": uiColor.component3,
      ":disabled": "transparent",
      ":is([data-focus-visible],:has([data-focused][data-focus-always-visible]))":
        blue.border3,
    },
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        uiColor.component2,
      ":is([data-pressed=true]):not(:disabled)": uiColor.component3,
      ":disabled": "transparent",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  tertiaryInvalid: {
    borderColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        criticalColor.component1,
      ":is([data-pressed=true]):not(:disabled)": criticalColor.component2,
      ":disabled": "transparent",
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        criticalColor.component1,
      ":is([data-pressed=true]):not(:disabled)": criticalColor.component2,
      ":disabled": "transparent",
    },
    color: criticalColor.text2,
  },
  tertiaryWarning: {
    borderColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        warningColor.component1,
      ":is([data-pressed=true]):not(:disabled)": warningColor.component2,
      ":disabled": "transparent",
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        warningColor.component1,
      ":is([data-pressed=true]):not(:disabled)": warningColor.component2,
      ":disabled": "transparent",
    },
    color: warningColor.text1,
  },
  tertiaryValid: {
    borderColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        successColor.component1,
      ":is([data-pressed=true]):not(:disabled)": successColor.component2,
      ":disabled": "transparent",
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]:not(:has(* [data-hovered])),:has(input[data-hovered])):not(:disabled)":
        successColor.component1,
      ":is([data-pressed=true]):not(:disabled)": successColor.component2,
      ":disabled": "transparent",
    },
    color: successColor.text1,
  },

  inputSizeSm: {
    fontSize: fontSize["xs"],
    paddingLeft: {
      ":first-child": horizontalSpace["md"],
    },
    paddingRight: horizontalSpace["xs"],
  },
  inputSizeMd: {
    fontSize: fontSize["sm"],
    paddingLeft: {
      ":first-child": horizontalSpace["md"],
    },
    paddingRight: horizontalSpace["md"],
  },
  inputSizeLg: {
    fontSize: fontSize["base"],
    paddingLeft: {
      ":first-child": horizontalSpace["xl"],
    },
    paddingRight: horizontalSpace["xl"],
  },
  wrapperSizeSm: {
    height: sizeSpace["xl"],
  },
  wrapperSizeMd: {
    height: sizeSpace["3xl"],
  },
  wrapperSizeLg: {
    height: sizeSpace["4xl"],
  },
  horizontalLabel: {
    gap: gap["2xl"],
    alignItems: "flex-start",
    flexDirection: "row",
  },
  horizontalLabelText: {
    flexGrow: 1,
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 0,
  },
  horizontalLabelTextSm: {
    lineHeight: sizeSpace["xl"],
  },
  horizontalLabelTextMd: {
    lineHeight: sizeSpace["3xl"],
  },
  horizontalLabelTextLg: {
    fontSize: fontSize["base"],
    fontWeight: fontWeight["medium"],
    lineHeight: sizeSpace["4xl"],
  },
  label: {
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
  },
  additionalText: {
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
  },
  required: {
    color: criticalColor.text1,
  },
});

export function useInputStyles({
  size: sizeProp,
  variant = "primary",
  labelVariant = "vertical",
  validationState,
}: {
  size: Size | undefined;
  variant: InputVariant | undefined;
  labelVariant: LabelVariant | undefined;
  validationState: InputValidationState | undefined;
}) {
  const size = sizeProp || use(SizeContext);

  return {
    field: [
      styles.field,
      labelVariant === "horizontal" && styles.horizontalLabel,
    ],
    wrapper: [
      styles.inputWrapper,
      ui.text,
      variant === "primary" && [
        styles.primary,
        validationState === "invalid" && [styles.primaryInvalid],
        validationState === "warning" && [styles.primaryWarning],
        validationState === "valid" && [styles.primaryValid],
      ],
      variant === "secondary" && [
        styles.secondary,
        validationState === "invalid" && [styles.secondaryInvalid],
        validationState === "warning" && [styles.secondaryWarning],
        validationState === "valid" && [styles.secondaryValid],
      ],
      variant === "tertiary" && [
        styles.tertiary,
        validationState === "invalid" && [styles.tertiaryInvalid],
        validationState === "warning" && [styles.tertiaryWarning],
        validationState === "valid" && [styles.tertiaryValid],
      ],
      size === "sm" && styles.wrapperSizeSm,
      size === "md" && styles.wrapperSizeMd,
      size === "lg" && styles.wrapperSizeLg,
    ],
    label: [
      styles.label,
      labelVariant === "horizontal" && [
        styles.horizontalLabelText,
        size === "sm" && styles.horizontalLabelTextSm,
        size === "md" && styles.horizontalLabelTextMd,
        size === "lg" && styles.horizontalLabelTextLg,
      ],
    ],
    description: [styles.additionalText],
    errorMessage: [styles.additionalText],
    required: [styles.required],
    input: [
      styles.input,
      size === "sm" && styles.inputSizeSm,
      size === "md" && styles.inputSizeMd,
      size === "lg" && styles.inputSizeLg,
    ],
    addon: [
      styles.addon,
      size === "sm" && styles.addonSm,
      size === "md" && styles.addonMd,
      size === "lg" && styles.addonLg,
    ] as unknown as stylex.StyleXStyles,
    validationIcon: [
      styles.validationIcon,
      validationState === "invalid" && [styles.invalidIcon],
      validationState === "valid" && [styles.validIcon],
      validationState === "warning" && [styles.warningIcon],
    ],
  };
}
