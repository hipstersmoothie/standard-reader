import * as stylex from "@stylexjs/stylex";

export const crimson = stylex.defineVars({
  bg: {
    default: "light-dark(#fffcfd, #191114)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.998 0.989 0.992), color(display-p3 0.093 0.068 0.078))",
  },
  bgSubtle: {
    default: "light-dark(#fef7f9, #201318)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.991 0.969 0.976), color(display-p3 0.117 0.078 0.095))",
  },
  component1: {
    default: "light-dark(#ffe9f0, #381525)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.987 0.917 0.941), color(display-p3 0.203 0.091 0.143))",
  },
  component2: {
    default: "light-dark(#fedce7, #4d122f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.975 0.866 0.904), color(display-p3 0.277 0.087 0.182))",
  },
  component3: {
    default: "light-dark(#facedd, #5c1839)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.813 0.864), color(display-p3 0.332 0.115 0.22))",
  },
  border1: {
    default: "light-dark(#f3bed1, #6d2545)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.921 0.755 0.817), color(display-p3 0.394 0.162 0.268))",
  },
  border2: {
    default: "light-dark(#eaacc3, #873356)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.88 0.683 0.761), color(display-p3 0.489 0.222 0.336))",
  },
  border3: {
    default: "light-dark(#e093b2, #b0436e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.834 0.592 0.694), color(display-p3 0.638 0.289 0.429))",
  },
  solid1: {
    default: "light-dark(#e93d82, #e93d82)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.843 0.298 0.507), color(display-p3 0.843 0.298 0.507))",
  },
  solid2: {
    default: "light-dark(#df3478, #ee518a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.807 0.266 0.468), color(display-p3 0.864 0.364 0.539))",
  },
  text1: {
    default: "light-dark(#cb1d63, #ff92ad)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.731 0.195 0.388), color(display-p3 1 0.56 0.66))",
  },
  text2: {
    default: "light-dark(#621639, #fdd3e8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.352 0.111 0.221), color(display-p3 0.966 0.834 0.906))",
  },
});
export const crimsonA = stylex.defineVars({
  bg: {
    default: "light-dark(#ff005503, #f4126709)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.349 / 0.012), color(display-p3 0.984 0.071 0.463 / 0.03))",
  },
  bgSubtle: {
    default: "light-dark(#e0004008, #f22f7a11)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.02 0.267 / 0.032), color(display-p3 0.996 0.282 0.569 / 0.055))",
  },
  component1: {
    default: "light-dark(#ff005216, #fe2a8b2a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.859 0.008 0.294 / 0.083), color(display-p3 0.996 0.227 0.573 / 0.148))",
  },
  component2: {
    default: "light-dark(#f8005123, #fd158741)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.827 0.008 0.298 / 0.134), color(display-p3 1 0.157 0.569 / 0.227))",
  },
  component3: {
    default: "light-dark(#e5004f31, #fd278f51)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.753 0.008 0.275 / 0.189), color(display-p3 1 0.231 0.604 / 0.286))",
  },
  border1: {
    default: "light-dark(#d0004b41, #fe459763)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.682 0.004 0.247 / 0.244), color(display-p3 1 0.337 0.643 / 0.349))",
  },
  border2: {
    default: "light-dark(#bf004753, #fd559b7f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.62 0.004 0.251 / 0.318), color(display-p3 1 0.416 0.663 / 0.454))",
  },
  border3: {
    default: "light-dark(#b6004a6c, #fe5b9bab)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.6 0.004 0.251 / 0.408), color(display-p3 0.996 0.427 0.651 / 0.614))",
  },
  solid1: {
    default: "light-dark(#e2005bc2, #fe418de8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.776 0 0.298 / 0.702), color(display-p3 1 0.345 0.596 / 0.832))",
  },
  solid2: {
    default: "light-dark(#d70056cb, #ff5693ed)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.737 0 0.275 / 0.734), color(display-p3 1 0.42 0.62 / 0.853))",
  },
  text1: {
    default: "light-dark(#c4004fe2, #ff92ad)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.731 0.195 0.388), color(display-p3 1 0.56 0.66))",
  },
  text2: {
    default: "light-dark(#530026e9, #ffd5eafd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.352 0.111 0.221), color(display-p3 0.966 0.834 0.906))",
  },
});
