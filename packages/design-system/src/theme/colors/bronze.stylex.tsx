import * as stylex from "@stylexjs/stylex";

export const bronze = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfcfc, #141110)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.991 0.988 0.988), color(display-p3 0.076 0.067 0.063))",
  },
  bgSubtle: {
    default: "light-dark(#fdf7f5, #1c1917)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.989 0.97 0.961), color(display-p3 0.106 0.097 0.093))",
  },
  component1: {
    default: "light-dark(#f6edea, #262220)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.958 0.932 0.919), color(display-p3 0.147 0.132 0.125))",
  },
  component2: {
    default: "light-dark(#efe4df, #302a27)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.929 0.894 0.877), color(display-p3 0.185 0.166 0.156))",
  },
  component3: {
    default: "light-dark(#e7d9d3, #3b3330)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.898 0.853 0.832), color(display-p3 0.227 0.202 0.19))",
  },
  border1: {
    default: "light-dark(#dfcdc5, #493e3a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.861 0.805 0.778), color(display-p3 0.278 0.246 0.23))",
  },
  border2: {
    default: "light-dark(#d3bcb3, #5a4c47)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.812 0.739 0.706), color(display-p3 0.343 0.302 0.281))",
  },
  border3: {
    default: "light-dark(#c2a499, #6f5f58)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.741 0.647 0.606), color(display-p3 0.426 0.374 0.347))",
  },
  solid1: {
    default: "light-dark(#a18072, #a18072)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.611 0.507 0.455), color(display-p3 0.611 0.507 0.455))",
  },
  solid2: {
    default: "light-dark(#957468, #ae8c7e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.563 0.461 0.414), color(display-p3 0.66 0.556 0.504))",
  },
  text1: {
    default: "light-dark(#7d5e54, #d4b3a5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.471 0.373 0.336), color(display-p3 0.81 0.707 0.655))",
  },
  text2: {
    default: "light-dark(#43302b, #ede0d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.251 0.191 0.172), color(display-p3 0.921 0.88 0.854))",
  },
});
export const bronzeA = stylex.defineVars({
  bg: {
    default: "light-dark(#55000003, #d1110004)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.349 0.024 0.024 / 0.012), color(display-p3 0.941 0.067 0 / 0.009))",
  },
  bgSubtle: {
    default: "light-dark(#cc33000a, #fbbc910c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.71 0.22 0.024 / 0.04), color(display-p3 0.98 0.8 0.706 / 0.043))",
  },
  component1: {
    default: "light-dark(#92250015, #faceb817)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.482 0.2 0.008 / 0.083), color(display-p3 0.988 0.851 0.761 / 0.085))",
  },
  component2: {
    default: "light-dark(#80280020, #facdb622)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.424 0.133 0.004 / 0.122), color(display-p3 0.996 0.839 0.78 / 0.127))",
  },
  component3: {
    default: "light-dark(#7423002c, #ffd2c12d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.4 0.145 0.004 / 0.169), color(display-p3 0.996 0.863 0.773 / 0.173))",
  },
  border1: {
    default: "light-dark(#7324003a, #ffd1c03c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.388 0.125 0.004 / 0.224), color(display-p3 1 0.863 0.796 / 0.227))",
  },
  border2: {
    default: "light-dark(#6c1f004c, #fdd0c04f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.365 0.11 0.004 / 0.295), color(display-p3 1 0.867 0.8 / 0.295))",
  },
  border3: {
    default: "light-dark(#671c0066, #ffd6c565)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.341 0.102 0.004 / 0.393), color(display-p3 1 0.859 0.788 / 0.387))",
  },
  solid1: {
    default: "light-dark(#551a008d, #fec7b09b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.29 0.094 0 / 0.546), color(display-p3 1 0.82 0.733 / 0.585))",
  },
  solid2: {
    default: "light-dark(#4c150097, #fecab5a9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.255 0.082 0 / 0.585), color(display-p3 1 0.839 0.761 / 0.635))",
  },
  text1: {
    default: "light-dark(#3d0f00ab, #ffd7c6d1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.471 0.373 0.336), color(display-p3 0.81 0.707 0.655))",
  },
  text2: {
    default: "light-dark(#1d0600d4, #fff1e9ec)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.251 0.191 0.172), color(display-p3 0.921 0.88 0.854))",
  },
});
