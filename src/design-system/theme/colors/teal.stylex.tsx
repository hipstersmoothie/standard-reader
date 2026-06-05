import * as stylex from "@stylexjs/stylex";

export const teal = stylex.defineVars({
  bg: {
    default: "light-dark(#fafefd, #0d1514)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.983 0.996 0.992), color(display-p3 0.059 0.083 0.079))",
  },
  bgSubtle: {
    default: "light-dark(#f3fbf9, #111c1b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.958 0.983 0.976), color(display-p3 0.075 0.11 0.107))",
  },
  component1: {
    default: "light-dark(#e0f8f3, #0d2d2a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.895 0.971 0.952), color(display-p3 0.087 0.175 0.165))",
  },
  component2: {
    default: "light-dark(#ccf3ea, #023b37)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.949 0.92), color(display-p3 0.087 0.227 0.214))",
  },
  component3: {
    default: "light-dark(#b8eae0, #084843)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.761 0.914 0.878), color(display-p3 0.12 0.277 0.261))",
  },
  border1: {
    default: "light-dark(#a1ded2, #145750)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.682 0.864 0.825), color(display-p3 0.162 0.335 0.314))",
  },
  border2: {
    default: "light-dark(#83cdc1, #1c6961)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.581 0.798 0.756), color(display-p3 0.205 0.406 0.379))",
  },
  border3: {
    default: "light-dark(#53b9ab, #207e73)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.433 0.716 0.671), color(display-p3 0.245 0.489 0.453))",
  },
  solid1: {
    default: "light-dark(#12a594, #12a594)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.297 0.637 0.581), color(display-p3 0.297 0.637 0.581))",
  },
  solid2: {
    default: "light-dark(#0d9b8a, #0eb39e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.275 0.599 0.542), color(display-p3 0.319 0.69 0.62))",
  },
  text1: {
    default: "light-dark(#008573, #0bd8b6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.08 0.5 0.43), color(display-p3 0.388 0.835 0.719))",
  },
  text2: {
    default: "light-dark(#0d3d38, #adf0dd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.11 0.235 0.219), color(display-p3 0.734 0.934 0.87))",
  },
});
export const tealA = stylex.defineVars({
  bg: {
    default: "light-dark(#00cc9905, #00deab05)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.757 0.514 / 0.016), color(display-p3 0 0.992 0.761 / 0.017))",
  },
  bgSubtle: {
    default: "light-dark(#00aa800c, #12fbe60c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.647 0.467 / 0.044), color(display-p3 0.235 0.988 0.902 / 0.047))",
  },
  component1: {
    default: "light-dark(#00c69d1f, #00ffe61e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.741 0.557 / 0.106), color(display-p3 0.235 1 0.898 / 0.118))",
  },
  component2: {
    default: "light-dark(#00c39633, #00ffe92d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.702 0.537 / 0.169), color(display-p3 0.18 0.996 0.929 / 0.173))",
  },
  component3: {
    default: "light-dark(#00b49047, #00ffea3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.643 0.494 / 0.24), color(display-p3 0.31 1 0.933 / 0.227))",
  },
  border1: {
    default: "light-dark(#00a6855e, #1cffe84b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.569 0.447 / 0.318), color(display-p3 0.396 1 0.933 / 0.286))",
  },
  border2: {
    default: "light-dark(#0099807c, #2efde85f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.518 0.424 / 0.42), color(display-p3 0.443 1 0.925 / 0.366))",
  },
  border3: {
    default: "light-dark(#009783ac, #32ffe775)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.506 0.424 / 0.569), color(display-p3 0.459 1 0.925 / 0.454))",
  },
  solid1: {
    default: "light-dark(#009e8ced, #13ffe49f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.482 0.404 / 0.702), color(display-p3 0.443 0.996 0.906 / 0.61))",
  },
  solid2: {
    default: "light-dark(#009684f2, #0dffe0ae)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.451 0.369 / 0.726), color(display-p3 0.439 0.996 0.89 / 0.669))",
  },
  text1: {
    default: "light-dark(#008573, #0afed5d6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.08 0.5 0.43), color(display-p3 0.388 0.835 0.719))",
  },
  text2: {
    default: "light-dark(#00332df2, #b8ffebef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.11 0.235 0.219), color(display-p3 0.734 0.934 0.87))",
  },
});
