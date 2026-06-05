import * as stylex from "@stylexjs/stylex";

export const purple = stylex.defineVars({
  bg: {
    default: "light-dark(#fefcfe, #18111b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.988 0.996), color(display-p3 0.09 0.068 0.103))",
  },
  bgSubtle: {
    default: "light-dark(#fbf7fe, #1e1523)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.983 0.971 0.993), color(display-p3 0.113 0.082 0.134))",
  },
  component1: {
    default: "light-dark(#f7edfe, #301c3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.963 0.931 0.989), color(display-p3 0.175 0.112 0.224))",
  },
  component2: {
    default: "light-dark(#f2e2fc, #3d224e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.937 0.888 0.981), color(display-p3 0.224 0.137 0.297))",
  },
  component3: {
    default: "light-dark(#ead5f9, #48295c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.904 0.837 0.966), color(display-p3 0.264 0.167 0.349))",
  },
  border1: {
    default: "light-dark(#e0c4f4, #54346b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.86 0.774 0.942), color(display-p3 0.311 0.208 0.406))",
  },
  border2: {
    default: "light-dark(#d1afec, #664282)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.799 0.69 0.91), color(display-p3 0.381 0.266 0.496))",
  },
  border3: {
    default: "light-dark(#be93e4, #8457aa)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.719 0.583 0.874), color(display-p3 0.49 0.349 0.649))",
  },
  solid1: {
    default: "light-dark(#8e4ec6, #8e4ec6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.523 0.318 0.751), color(display-p3 0.523 0.318 0.751))",
  },
  solid2: {
    default: "light-dark(#8347b9, #9a5cd0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.483 0.289 0.7), color(display-p3 0.57 0.373 0.791))",
  },
  text1: {
    default: "light-dark(#8145b5, #d19dff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.473 0.281 0.687), color(display-p3 0.8 0.62 1))",
  },
  text2: {
    default: "light-dark(#402060, #ecd9fa)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.234 0.132 0.363), color(display-p3 0.913 0.854 0.971))",
  },
});
export const purpleA = stylex.defineVars({
  bg: {
    default: "light-dark(#aa00aa03, #b412f90b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.675 / 0.012), color(display-p3 0.686 0.071 0.996 / 0.038))",
  },
  bgSubtle: {
    default: "light-dark(#8000e008, #b744f714)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.443 0.024 0.722 / 0.028), color(display-p3 0.722 0.286 0.996 / 0.072))",
  },
  component1: {
    default: "light-dark(#8e00f112, #c150ff2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.506 0.008 0.835 / 0.071), color(display-p3 0.718 0.349 0.996 / 0.169))",
  },
  component2: {
    default: "light-dark(#8d00e51d, #bb53fd42)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.451 0.004 0.831 / 0.114), color(display-p3 0.702 0.353 1 / 0.248))",
  },
  component3: {
    default: "light-dark(#8000db2a, #be5cfd51)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.431 0.004 0.788 / 0.165), color(display-p3 0.718 0.404 1 / 0.303))",
  },
  border1: {
    default: "light-dark(#7a01d03b, #c16dfd61)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.384 0.004 0.745 / 0.228), color(display-p3 0.733 0.455 1 / 0.366))",
  },
  border2: {
    default: "light-dark(#6d00c350, #c378fd7a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.357 0.004 0.71 / 0.31), color(display-p3 0.753 0.506 1 / 0.458))",
  },
  border3: {
    default: "light-dark(#6600c06c, #c47effa4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.322 0.004 0.702 / 0.416), color(display-p3 0.749 0.522 1 / 0.622))",
  },
  solid1: {
    default: "light-dark(#5c00adb1, #b661ffc2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.298 0 0.639 / 0.683), color(display-p3 0.686 0.408 1 / 0.736))",
  },
  solid2: {
    default: "light-dark(#53009eb8, #bc6fffcd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.271 0 0.58 / 0.71), color(display-p3 0.71 0.459 1 / 0.778))",
  },
  text1: {
    default: "light-dark(#52009aba, #d19dff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.473 0.281 0.687), color(display-p3 0.8 0.62 1))",
  },
  text2: {
    default: "light-dark(#250049df, #f1ddfffa)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.234 0.132 0.363), color(display-p3 0.913 0.854 0.971))",
  },
});
