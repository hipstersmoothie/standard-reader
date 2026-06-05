import * as stylex from "@stylexjs/stylex";

export const blue = stylex.defineVars({
  bg: {
    default: "light-dark(#fbfdff, #0d1520)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.986 0.992 0.999), color(display-p3 0.057 0.081 0.122))",
  },
  bgSubtle: {
    default: "light-dark(#f4faff, #111927)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.96 0.979 0.998), color(display-p3 0.072 0.098 0.147))",
  },
  component1: {
    default: "light-dark(#e6f4fe, #0d2847)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.912 0.956 0.991), color(display-p3 0.078 0.154 0.27))",
  },
  component2: {
    default: "light-dark(#d5efff, #003362)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.853 0.932 1), color(display-p3 0.033 0.197 0.37))",
  },
  component3: {
    default: "light-dark(#c2e5ff, #004074)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.788 0.894 0.998), color(display-p3 0.08 0.245 0.441))",
  },
  border1: {
    default: "light-dark(#acd8fc, #104d87)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.709 0.843 0.976), color(display-p3 0.14 0.298 0.511))",
  },
  border2: {
    default: "light-dark(#8ec8f6, #205d9e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.606 0.777 0.947), color(display-p3 0.195 0.361 0.6))",
  },
  border3: {
    default: "light-dark(#5eb1ef, #2870bd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.451 0.688 0.917), color(display-p3 0.239 0.434 0.72))",
  },
  solid1: {
    default: "light-dark(#0090ff, #0090ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.247 0.556 0.969), color(display-p3 0.247 0.556 0.969))",
  },
  solid2: {
    default: "light-dark(#0588f0, #3b9eff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.234 0.523 0.912), color(display-p3 0.344 0.612 0.973))",
  },
  text1: {
    default: "light-dark(#0d74ce, #70b8ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.15 0.44 0.84), color(display-p3 0.49 0.72 1))",
  },
  text2: {
    default: "light-dark(#113264, #c2e6ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.102 0.193 0.379), color(display-p3 0.788 0.898 0.99))",
  },
});
export const blueA = stylex.defineVars({
  bg: {
    default: "light-dark(#0080ff04, #004df211)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.514 1 / 0.016), color(display-p3 0 0.333 1 / 0.059))",
  },
  bgSubtle: {
    default: "light-dark(#008cff0b, #1166fb18)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.514 0.906 / 0.04), color(display-p3 0.114 0.435 0.988 / 0.085))",
  },
  component1: {
    default: "light-dark(#008ff519, #0077ff3a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.506 0.914 / 0.087), color(display-p3 0.122 0.463 1 / 0.219))",
  },
  component2: {
    default: "light-dark(#009eff2a, #0075ff57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.545 1 / 0.146), color(display-p3 0 0.467 1 / 0.324))",
  },
  component3: {
    default: "light-dark(#0093ff3d, #0081fd6b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.502 0.984 / 0.212), color(display-p3 0.098 0.51 1 / 0.4))",
  },
  border1: {
    default: "light-dark(#0088f653, #0f89fd7f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.463 0.922 / 0.291), color(display-p3 0.224 0.557 1 / 0.475))",
  },
  border2: {
    default: "light-dark(#0083eb71, #2a91fe98)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.431 0.863 / 0.393), color(display-p3 0.294 0.584 1 / 0.572))",
  },
  border3: {
    default: "light-dark(#0084e6a1, #3094feb9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.427 0.851 / 0.55), color(display-p3 0.314 0.592 1 / 0.702))",
  },
  solid1: {
    default: "light-dark(#0090ff, #0090ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.412 0.961 / 0.753), color(display-p3 0.251 0.573 0.996 / 0.967))",
  },
  solid2: {
    default: "light-dark(#0086f0fa, #3b9eff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.376 0.886 / 0.765), color(display-p3 0.357 0.631 1 / 0.971))",
  },
  text1: {
    default: "light-dark(#006dcbf2, #70b8ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.15 0.44 0.84), color(display-p3 0.49 0.72 1))",
  },
  text2: {
    default: "light-dark(#002359ee, #c2e6ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.102 0.193 0.379), color(display-p3 0.788 0.898 0.99))",
  },
});
