import * as stylex from "@stylexjs/stylex";

export const plum = stylex.defineVars({
  bg: {
    default: "light-dark(#fefcff, #181118)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.988 0.999), color(display-p3 0.09 0.068 0.092))",
  },
  bgSubtle: {
    default: "light-dark(#fdf7fd, #201320)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.971 0.99), color(display-p3 0.118 0.077 0.121))",
  },
  component1: {
    default: "light-dark(#fbebfb, #351a35)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.973 0.923 0.98), color(display-p3 0.192 0.105 0.202))",
  },
  component2: {
    default: "light-dark(#f7def8, #451d47)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.875 0.966), color(display-p3 0.25 0.121 0.271))",
  },
  component3: {
    default: "light-dark(#f2d1f3, #512454)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.926 0.825 0.945), color(display-p3 0.293 0.152 0.319))",
  },
  border1: {
    default: "light-dark(#e9c2ec, #5e3061)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.89 0.765 0.916), color(display-p3 0.343 0.198 0.372))",
  },
  border2: {
    default: "light-dark(#deade3, #734079)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.84 0.686 0.877), color(display-p3 0.424 0.262 0.461))",
  },
  border3: {
    default: "light-dark(#cf91d8, #92549c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.775 0.58 0.832), color(display-p3 0.54 0.341 0.595))",
  },
  solid1: {
    default: "light-dark(#ab4aba, #ab4aba)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.624 0.313 0.708), color(display-p3 0.624 0.313 0.708))",
  },
  solid2: {
    default: "light-dark(#a144af, #b658c4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.587 0.29 0.667), color(display-p3 0.666 0.365 0.748))",
  },
  text1: {
    default: "light-dark(#953ea3, #e796f3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.543 0.263 0.619), color(display-p3 0.86 0.602 0.933))",
  },
  text2: {
    default: "light-dark(#53195d, #f4d4f4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.299 0.114 0.352), color(display-p3 0.936 0.836 0.949))",
  },
});
export const plumA = stylex.defineVars({
  bg: {
    default: "light-dark(#aa00ff03, #f112f108)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 1 / 0.012), color(display-p3 0.973 0.071 0.973 / 0.026))",
  },
  bgSubtle: {
    default: "light-dark(#c000c008, #f22ff211)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.58 0.024 0.58 / 0.028), color(display-p3 0.933 0.267 1 / 0.059))",
  },
  component1: {
    default: "light-dark(#cc00cc14, #fd4cfd27)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.655 0.008 0.753 / 0.079), color(display-p3 0.918 0.333 0.996 / 0.148))",
  },
  component2: {
    default: "light-dark(#c200c921, #f646ff3a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.627 0.008 0.722 / 0.126), color(display-p3 0.91 0.318 1 / 0.219))",
  },
  component3: {
    default: "light-dark(#b700bd2e, #f455ff48)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.58 0.004 0.69 / 0.177), color(display-p3 0.914 0.388 1 / 0.269))",
  },
  border1: {
    default: "light-dark(#a400b03d, #f66dff56)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.537 0.004 0.655 / 0.236), color(display-p3 0.906 0.463 1 / 0.328))",
  },
  border2: {
    default: "light-dark(#9900a852, #f07cfd70)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.49 0.004 0.616 / 0.314), color(display-p3 0.906 0.529 1 / 0.425))",
  },
  border3: {
    default: "light-dark(#9000a56e, #ee84ff95)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.471 0.004 0.6 / 0.42), color(display-p3 0.906 0.553 1 / 0.568))",
  },
  solid1: {
    default: "light-dark(#89009eb5, #e961feb6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.451 0 0.576 / 0.687), color(display-p3 0.875 0.427 1 / 0.69))",
  },
  solid2: {
    default: "light-dark(#7f0092bb, #ed70ffc0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.42 0 0.529 / 0.71), color(display-p3 0.886 0.471 0.996 / 0.732))",
  },
  text1: {
    default: "light-dark(#730086c1, #f19cfef3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.543 0.263 0.619), color(display-p3 0.86 0.602 0.933))",
  },
  text2: {
    default: "light-dark(#40004be6, #feddfef4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.299 0.114 0.352), color(display-p3 0.936 0.836 0.949))",
  },
});
