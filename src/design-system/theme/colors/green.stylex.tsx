import * as stylex from "@stylexjs/stylex";

export const green = stylex.defineVars({
  bg: {
    default: "light-dark(#fbfefc, #0e1512)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.986 0.996 0.989), color(display-p3 0.062 0.083 0.071))",
  },
  bgSubtle: {
    default: "light-dark(#f4fbf6, #121b17)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.963 0.983 0.967), color(display-p3 0.079 0.106 0.09))",
  },
  component1: {
    default: "light-dark(#e6f6eb, #132d21)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.913 0.964 0.925), color(display-p3 0.1 0.173 0.133))",
  },
  component2: {
    default: "light-dark(#d6f1df, #113b29)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.859 0.94 0.879), color(display-p3 0.115 0.229 0.166))",
  },
  component3: {
    default: "light-dark(#c4e8d1, #174933)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.796 0.907 0.826), color(display-p3 0.147 0.282 0.206))",
  },
  border1: {
    default: "light-dark(#adddc0, #20573e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.718 0.863 0.761), color(display-p3 0.185 0.338 0.25))",
  },
  border2: {
    default: "light-dark(#8eceaa, #28684a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.61 0.801 0.675), color(display-p3 0.227 0.403 0.298))",
  },
  border3: {
    default: "light-dark(#5bb98b, #2f7c57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.451 0.715 0.559), color(display-p3 0.27 0.479 0.351))",
  },
  solid1: {
    default: "light-dark(#30a46c, #30a46c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.332 0.634 0.442), color(display-p3 0.332 0.634 0.442))",
  },
  solid2: {
    default: "light-dark(#2b9a66, #33b074)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.308 0.595 0.417), color(display-p3 0.357 0.682 0.474))",
  },
  text1: {
    default: "light-dark(#218358, #3dd68c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.19 0.5 0.32), color(display-p3 0.434 0.828 0.573))",
  },
  text2: {
    default: "light-dark(#193b2d, #b1f1cb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.132 0.228 0.18), color(display-p3 0.747 0.938 0.807))",
  },
});
export const greenA = stylex.defineVars({
  bg: {
    default: "light-dark(#00c04004, #00de4505)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.757 0.267 / 0.016), color(display-p3 0 0.992 0.298 / 0.017))",
  },
  bgSubtle: {
    default: "light-dark(#00a32f0b, #29f99d0b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.565 0.129 / 0.036), color(display-p3 0.341 0.98 0.616 / 0.043))",
  },
  component1: {
    default: "light-dark(#00a43319, #22ff991e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.596 0.145 / 0.087), color(display-p3 0.376 0.996 0.655 / 0.114))",
  },
  component2: {
    default: "light-dark(#00a83829, #11ff992d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.588 0.145 / 0.142), color(display-p3 0.341 0.996 0.635 / 0.173))",
  },
  component3: {
    default: "light-dark(#019c393b, #2bffa23c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.541 0.157 / 0.204), color(display-p3 0.408 1 0.678 / 0.232))",
  },
  border1: {
    default: "light-dark(#00963c52, #44ffaa4b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.518 0.157 / 0.283), color(display-p3 0.475 1 0.706 / 0.29))",
  },
  border2: {
    default: "light-dark(#00914071, #50fdac5e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.486 0.165 / 0.389), color(display-p3 0.514 1 0.706 / 0.362))",
  },
  border3: {
    default: "light-dark(#00924ba4, #54ffad73)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.478 0.2 / 0.55), color(display-p3 0.529 1 0.718 / 0.442))",
  },
  solid1: {
    default: "light-dark(#008f4acf, #44ffa49e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.455 0.165 / 0.667), color(display-p3 0.502 0.996 0.682 / 0.61))",
  },
  solid2: {
    default: "light-dark(#008647d4, #43fea4ab)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.416 0.153 / 0.691), color(display-p3 0.506 1 0.682 / 0.66))",
  },
  text1: {
    default: "light-dark(#00713fde, #46fea5d4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.19 0.5 0.32), color(display-p3 0.434 0.828 0.573))",
  },
  text2: {
    default: "light-dark(#002616e6, #bbffd7f0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.132 0.228 0.18), color(display-p3 0.747 0.938 0.807))",
  },
});
