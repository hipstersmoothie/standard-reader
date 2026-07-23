import * as stylex from "@stylexjs/stylex";

export const gold = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfdfc, #121211)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.989), color(display-p3 0.071 0.071 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#faf9f2, #1b1a17)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 0.976 0.953), color(display-p3 0.104 0.101 0.09))",
  },
  component1: {
    default: "light-dark(#f2f0e7, #24231f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.947 0.94 0.909), color(display-p3 0.141 0.136 0.122))",
  },
  component2: {
    default: "light-dark(#eae6db, #2d2b26)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.914 0.904 0.865), color(display-p3 0.177 0.17 0.152))",
  },
  component3: {
    default: "light-dark(#e1dccf, #38352e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.88 0.865 0.816), color(display-p3 0.217 0.207 0.185))",
  },
  border1: {
    default: "light-dark(#d8d0bf, #444039)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.84 0.818 0.756), color(display-p3 0.265 0.252 0.225))",
  },
  border2: {
    default: "light-dark(#cbc0aa, #544f46)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.788 0.753 0.677), color(display-p3 0.327 0.31 0.277))",
  },
  border3: {
    default: "light-dark(#b9a88d, #696256)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.715 0.66 0.565), color(display-p3 0.407 0.384 0.342))",
  },
  solid1: {
    default: "light-dark(#978365, #978365)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.579 0.517 0.41), color(display-p3 0.579 0.517 0.41))",
  },
  solid2: {
    default: "light-dark(#8c7a5e, #a39073)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.538 0.479 0.38), color(display-p3 0.628 0.566 0.463))",
  },
  text1: {
    default: "light-dark(#71624b, #cbb99f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.433 0.386 0.305), color(display-p3 0.784 0.728 0.635))",
  },
  text2: {
    default: "light-dark(#3b352b, #e8e2d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.227 0.209 0.173), color(display-p3 0.906 0.887 0.855))",
  },
});
export const goldA = stylex.defineVars({
  bg: {
    default: "light-dark(#55550003, #91911102)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.349 0.349 0.024 / 0.012), color(display-p3 0.855 0.855 0.071 / 0.005))",
  },
  bgSubtle: {
    default: "light-dark(#9d8a000d, #f9e29d0b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.592 0.514 0.024 / 0.048), color(display-p3 0.98 0.89 0.616 / 0.043))",
  },
  component1: {
    default: "light-dark(#75600018, #f8ecbb15)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.4 0.357 0.012 / 0.091), color(display-p3 1 0.949 0.753 / 0.08))",
  },
  component2: {
    default: "light-dark(#6b4e0024, #ffeec41e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.357 0.298 0.008 / 0.134), color(display-p3 1 0.933 0.8 / 0.118))",
  },
  component3: {
    default: "light-dark(#60460030, #feecc22a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.345 0.282 0.004 / 0.185), color(display-p3 1 0.949 0.804 / 0.16))",
  },
  border1: {
    default: "light-dark(#64440040, #feebcb37)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.341 0.263 0.004 / 0.244), color(display-p3 1 0.925 0.8 / 0.215))",
  },
  border2: {
    default: "light-dark(#63420055, #ffedcd48)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.345 0.235 0.004 / 0.322), color(display-p3 1 0.945 0.831 / 0.278))",
  },
  border3: {
    default: "light-dark(#633d0072, #fdeaca5f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.345 0.22 0.004 / 0.436), color(display-p3 1 0.937 0.82 / 0.366))",
  },
  solid1: {
    default: "light-dark(#5332009a, #ffdba690)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.286 0.18 0 / 0.589), color(display-p3 0.996 0.882 0.69 / 0.551))",
  },
  solid2: {
    default: "light-dark(#492d00a1, #fedfb09d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.255 0.161 0 / 0.62), color(display-p3 1 0.894 0.725 / 0.601))",
  },
  text1: {
    default: "light-dark(#362100b4, #fee7c6c8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.433 0.386 0.305), color(display-p3 0.784 0.728 0.635))",
  },
  text2: {
    default: "light-dark(#130c00d4, #fef7ede7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.227 0.209 0.173), color(display-p3 0.906 0.887 0.855))",
  },
});
