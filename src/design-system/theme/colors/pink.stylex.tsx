import * as stylex from "@stylexjs/stylex";

export const pink = stylex.defineVars({
  bg: {
    default: "light-dark(#fffcfe, #191117)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.998 0.989 0.996), color(display-p3 0.093 0.068 0.089))",
  },
  bgSubtle: {
    default: "light-dark(#fef7fb, #21121d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.97 0.985), color(display-p3 0.121 0.073 0.11))",
  },
  component1: {
    default: "light-dark(#fee9f5, #37172f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.981 0.917 0.96), color(display-p3 0.198 0.098 0.179))",
  },
  component2: {
    default: "light-dark(#fbdcef, #4b143d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.963 0.867 0.932), color(display-p3 0.271 0.095 0.231))",
  },
  component3: {
    default: "light-dark(#f6cee7, #591c47)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.939 0.815 0.899), color(display-p3 0.32 0.127 0.273))",
  },
  border1: {
    default: "light-dark(#efbfdd, #692955)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.907 0.756 0.859), color(display-p3 0.382 0.177 0.326))",
  },
  border2: {
    default: "light-dark(#e7acd0, #833869)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.869 0.683 0.81), color(display-p3 0.477 0.238 0.405))",
  },
  border3: {
    default: "light-dark(#dd93c2, #a84885)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.825 0.59 0.751), color(display-p3 0.612 0.304 0.51))",
  },
  solid1: {
    default: "light-dark(#d6409f, #d6409f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.775 0.297 0.61), color(display-p3 0.775 0.297 0.61))",
  },
  solid2: {
    default: "light-dark(#cf3897, #de51a8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.748 0.27 0.581), color(display-p3 0.808 0.356 0.645))",
  },
  text1: {
    default: "light-dark(#c2298a, #ff8dcc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.698 0.219 0.528), color(display-p3 1 0.535 0.78))",
  },
  text2: {
    default: "light-dark(#651249, #fdd1ea)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.363 0.101 0.279), color(display-p3 0.964 0.826 0.912))",
  },
});
export const pinkA = stylex.defineVars({
  bg: {
    default: "light-dark(#ff00aa03, #f412bc09)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.675 / 0.012), color(display-p3 0.984 0.071 0.855 / 0.03))",
  },
  bgSubtle: {
    default: "light-dark(#e0008008, #f420bb12)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.02 0.51 / 0.032), color(display-p3 1 0.2 0.8 / 0.059))",
  },
  component1: {
    default: "light-dark(#f4008c16, #fe37cc29)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.765 0.008 0.529 / 0.083), color(display-p3 1 0.294 0.886 / 0.139))",
  },
  component2: {
    default: "light-dark(#e2008b23, #fc1ec43f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.737 0.008 0.506 / 0.134), color(display-p3 1 0.192 0.82 / 0.219))",
  },
  component3: {
    default: "light-dark(#d1008331, #fd35c24e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.663 0.004 0.451 / 0.185), color(display-p3 1 0.282 0.827 / 0.274))",
  },
  border1: {
    default: "light-dark(#c0007840, #fd51c75f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.616 0.004 0.424 / 0.244), color(display-p3 1 0.396 0.835 / 0.337))",
  },
  border2: {
    default: "light-dark(#b6006f53, #fd62c87b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.596 0.004 0.412 / 0.318), color(display-p3 1 0.459 0.831 / 0.442))",
  },
  border3: {
    default: "light-dark(#af006f6c, #ff68c8a2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.573 0.004 0.404 / 0.412), color(display-p3 1 0.478 0.827 / 0.585))",
  },
  solid1: {
    default: "light-dark(#c8007fbf, #fe49bcd4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.682 0 0.447 / 0.702), color(display-p3 1 0.373 0.784 / 0.761))",
  },
  solid2: {
    default: "light-dark(#c2007ac7, #ff5cc0dc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.655 0 0.424 / 0.73), color(display-p3 1 0.435 0.792 / 0.795))",
  },
  text1: {
    default: "light-dark(#b60074d6, #ff8dcc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.698 0.219 0.528), color(display-p3 1 0.535 0.78))",
  },
  text2: {
    default: "light-dark(#59003bed, #ffd3ecfd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.363 0.101 0.279), color(display-p3 0.964 0.826 0.912))",
  },
});
