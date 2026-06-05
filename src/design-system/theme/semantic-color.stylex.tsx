import * as stylex from "@stylexjs/stylex";

import { animationDuration } from "./animations.stylex";
import {
  criticalColor,
  primaryColor,
  successColor,
  uiColor,
  warningColor,
} from "./color.stylex";
import { red } from "./colors/red.stylex";
import { yellow } from "./colors/yellow.stylex";
import { fontFamily } from "./typography.stylex";

// eslint-disable-next-line @stylexjs/enforce-extension
export const ui = stylex.create({
  bg: { backgroundColor: uiColor.bg },
  bgSubtle: { backgroundColor: uiColor.bgSubtle },
  bgDim: { backgroundColor: uiColor.component1 },
  bgSecondary: { backgroundColor: uiColor.component2 },
  bgActive: { backgroundColor: uiColor.component3 },
  borderDim: {
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  border: {
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  borderInteractive: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
    },
    borderStyle: "solid",
    borderWidth: 1,

    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolid: { backgroundColor: uiColor.solid1 },
  bgSolidDark: { backgroundColor: uiColor.solid2 },
  textDim: { color: uiColor.text1, fontFamily: fontFamily["sans"] },
  text: { color: uiColor.text2, fontFamily: fontFamily["sans"] },
  textContrast: { color: uiColor.textContrast },
  overlay: { backgroundColor: uiColor.overlayBackdrop },

  bgGhost: {
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        uiColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        uiColor.component3,
      ":disabled": "transparent",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgUi: {
    backgroundColor: {
      default: uiColor.component1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        uiColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        uiColor.component3,
      ":disabled": uiColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgAction: {
    backgroundColor: {
      default: uiColor.component2,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        uiColor.component3,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        uiColor.component3,
      ":disabled": uiColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolidAction: {
    backgroundColor: {
      default: uiColor.solid1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        uiColor.solid2,
      ":disabled": uiColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
});

// eslint-disable-next-line @stylexjs/enforce-extension
export const primary = stylex.create({
  bg: { backgroundColor: primaryColor.bg },
  bgSubtle: { backgroundColor: primaryColor.bgSubtle },
  bgDim: { backgroundColor: primaryColor.component1 },
  bgSecondary: { backgroundColor: primaryColor.component2 },
  bgActive: { backgroundColor: primaryColor.component3 },
  borderDim: {
    borderColor: primaryColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  border: {
    borderColor: primaryColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  borderInteractive: {
    borderColor: {
      default: primaryColor.border2,
      ":is([data-hovered])": primaryColor.border3,
    },
    borderStyle: "solid",
    borderWidth: 1,

    transitionDuration: animationDuration.slow,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolid: { backgroundColor: primaryColor.solid1 },
  bgSolidDark: { backgroundColor: primaryColor.solid2 },
  textDim: { color: primaryColor.text1, fontFamily: fontFamily["sans"] },
  text: { color: primaryColor.text2, fontFamily: fontFamily["sans"] },
  textContrast: { color: primaryColor.textContrast },

  bgGhost: {
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        primaryColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        primaryColor.component3,
      ":disabled": primaryColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgUi: {
    backgroundColor: {
      default: primaryColor.component1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        primaryColor.component2,
      ":is([data-pressed=true])": primaryColor.component3,
      ":disabled": primaryColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgAction: {
    backgroundColor: {
      default: primaryColor.component2,
      ":is([data-hovered]:not(:has(* [data-hovered])):not(:disabled))":
        primaryColor.component3,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        primaryColor.border1,
      ":disabled": primaryColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolidAction: {
    backgroundColor: {
      default: primaryColor.solid1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        primaryColor.solid2,
      ":disabled": primaryColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
});

// eslint-disable-next-line @stylexjs/enforce-extension
export const critical = stylex.create({
  bg: { backgroundColor: criticalColor.bg },
  bgSubtle: { backgroundColor: criticalColor.bgSubtle },
  bgDim: { backgroundColor: criticalColor.component1 },
  bgSecondary: { backgroundColor: criticalColor.component2 },
  bgActive: { backgroundColor: criticalColor.component3 },
  borderDim: {
    borderColor: criticalColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  border: {
    borderColor: criticalColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  borderInteractive: {
    borderColor: {
      default: criticalColor.border1,
      ":is([data-hovered])": red.border1,
    },
    borderStyle: "solid",
    borderWidth: 1,
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolid: { backgroundColor: criticalColor.solid1 },
  bgSolidDark: { backgroundColor: criticalColor.solid2 },
  textDim: { color: criticalColor.text1, fontFamily: fontFamily["sans"] },
  text: { color: criticalColor.text2, fontFamily: fontFamily["sans"] },
  textContrast: { color: "white" },

  bgGhost: {
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        criticalColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        criticalColor.component3,
      ":disabled": criticalColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgUi: {
    backgroundColor: {
      default: criticalColor.component1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        criticalColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        criticalColor.component3,
      // ":disabled": criticalColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgAction: {
    backgroundColor: {
      default: criticalColor.component2,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        criticalColor.component3,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        criticalColor.component3,
      ":disabled": criticalColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolidAction: {
    backgroundColor: {
      default: criticalColor.solid1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        criticalColor.solid2,
      ":disabled": criticalColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
});

// eslint-disable-next-line @stylexjs/enforce-extension
export const warning = stylex.create({
  bg: { backgroundColor: warningColor.bg },
  bgSubtle: { backgroundColor: warningColor.bgSubtle },
  bgDim: { backgroundColor: warningColor.component1 },
  bgSecondary: { backgroundColor: warningColor.component2 },
  bgActive: { backgroundColor: warningColor.component3 },
  borderDim: {
    borderColor: warningColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  border: {
    borderColor: warningColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  borderInteractive: {
    borderColor: {
      default: warningColor.border1,
      ":is([data-hovered])": warningColor.border2,
    },
    borderStyle: "solid",
    borderWidth: 1,
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolid: { backgroundColor: warningColor.solid1 },
  bgSolidDark: { backgroundColor: warningColor.solid2 },
  textDim: { color: warningColor.text1, fontFamily: fontFamily["sans"] },
  text: { color: warningColor.text2, fontFamily: fontFamily["sans"] },
  textContrast: { color: warningColor.textContrast },

  bgGhost: {
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        warningColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        warningColor.component3,
      ":disabled": warningColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgUi: {
    backgroundColor: {
      default: warningColor.component1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        warningColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        yellow.component3,
      ":disabled": warningColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgAction: {
    backgroundColor: {
      default: warningColor.component2,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        warningColor.component3,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        warningColor.component3,
      ":disabled": warningColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolidAction: {
    backgroundColor: {
      default: warningColor.solid1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        warningColor.solid2,
      ":disabled": warningColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
});

// eslint-disable-next-line @stylexjs/enforce-extension
export const success = stylex.create({
  bg: { backgroundColor: successColor.bg },
  bgSubtle: { backgroundColor: successColor.bgSubtle },
  bgDim: { backgroundColor: successColor.component1 },
  bgSecondary: { backgroundColor: successColor.component2 },
  bgActive: { backgroundColor: successColor.component3 },
  borderDim: {
    borderColor: successColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  border: {
    borderColor: successColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
  },
  borderInteractive: {
    borderColor: {
      default: successColor.border1,
      ":is([data-hovered])": successColor.border2,
    },
    borderStyle: "solid",
    borderWidth: 1,
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolid: { backgroundColor: successColor.solid1 },
  bgSolidDark: { backgroundColor: successColor.solid2 },
  textDim: { color: successColor.text1, fontFamily: fontFamily["sans"] },
  text: { color: successColor.text2, fontFamily: fontFamily["sans"] },
  textContrast: { color: successColor.textContrast },

  bgGhost: {
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        successColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        successColor.component3,
      ":disabled": successColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgUi: {
    backgroundColor: {
      default: successColor.component1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        successColor.component2,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        successColor.component3,
      ":disabled": successColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgAction: {
    backgroundColor: {
      default: successColor.component2,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        successColor.component3,
      ":is([data-pressed=true]):is([data-pressed=true]):not(:disabled)":
        successColor.component3,
      ":disabled": successColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
  bgSolidAction: {
    backgroundColor: {
      default: successColor.solid1,
      ":is([data-hovered]):not(:has(* [data-hovered])):not(:disabled)":
        successColor.solid2,
      ":disabled": successColor.component1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
  },
});
