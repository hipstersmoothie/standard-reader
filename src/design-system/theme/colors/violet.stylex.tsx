import * as stylex from "@stylexjs/stylex";

export const violet = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfcfe, #14121f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.991 0.988 0.995), color(display-p3 0.077 0.071 0.118))",
  },
  bgSubtle: {
    default: "light-dark(#faf8ff, #1b1525)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.978 0.974 0.998), color(display-p3 0.101 0.084 0.141))",
  },
  component1: {
    default: "light-dark(#f4f0fe, #291f43)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.943 0.993), color(display-p3 0.154 0.123 0.256))",
  },
  component2: {
    default: "light-dark(#ebe4ff, #33255b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.916 0.897 1), color(display-p3 0.191 0.148 0.345))",
  },
  component3: {
    default: "light-dark(#e1d9ff, #3c2e69)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.876 0.851 1), color(display-p3 0.226 0.182 0.396))",
  },
  border1: {
    default: "light-dark(#d4cafe, #473876)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.825 0.793 0.981), color(display-p3 0.269 0.223 0.449))",
  },
  border2: {
    default: "light-dark(#c2b5f5, #56468b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.752 0.712 0.943), color(display-p3 0.326 0.277 0.53))",
  },
  border3: {
    default: "light-dark(#aa99ec, #6958ad)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.654 0.602 0.902), color(display-p3 0.399 0.346 0.656))",
  },
  solid1: {
    default: "light-dark(#6e56cf, #6e56cf)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.417 0.341 0.784), color(display-p3 0.417 0.341 0.784))",
  },
  solid2: {
    default: "light-dark(#654dc4, #7d66d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.381 0.306 0.741), color(display-p3 0.477 0.402 0.823))",
  },
  text1: {
    default: "light-dark(#6550b9, #baa7ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.383 0.317 0.702), color(display-p3 0.72 0.65 1))",
  },
  text2: {
    default: "light-dark(#2f265f, #e2ddfe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.179 0.15 0.359), color(display-p3 0.883 0.867 0.986))",
  },
});
export const violetA = stylex.defineVars({
  bg: {
    default: "light-dark(#5500aa03, #4422ff0f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.349 0.024 0.675 / 0.012), color(display-p3 0.282 0.141 0.996 / 0.055))",
  },
  bgSubtle: {
    default: "light-dark(#4900ff07, #853ff916)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.161 0.024 0.863 / 0.028), color(display-p3 0.51 0.263 1 / 0.08))",
  },
  component1: {
    default: "light-dark(#4400ee0f, #8354fe36)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.204 0.004 0.871 / 0.059), color(display-p3 0.494 0.337 0.996 / 0.202))",
  },
  component2: {
    default: "light-dark(#4300ff1b, #7d51fd50)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.196 0.004 1 / 0.102), color(display-p3 0.49 0.345 1 / 0.299))",
  },
  component3: {
    default: "light-dark(#3600ff26, #845ffd5f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.165 0.008 1 / 0.15), color(display-p3 0.525 0.392 1 / 0.353))",
  },
  border1: {
    default: "light-dark(#3100fb35, #8f6cfd6d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.153 0.004 0.906 / 0.208), color(display-p3 0.569 0.455 1 / 0.408))",
  },
  border2: {
    default: "light-dark(#2d01dd4a, #9879ff83)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.141 0.004 0.796 / 0.287), color(display-p3 0.588 0.494 1 / 0.496))",
  },
  border3: {
    default: "light-dark(#2b00d066, #977dfea8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.133 0.004 0.753 / 0.397), color(display-p3 0.596 0.51 1 / 0.631))",
  },
  solid1: {
    default: "light-dark(#2400b7a9, #8668ffcc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.114 0 0.675 / 0.659), color(display-p3 0.522 0.424 1 / 0.769))",
  },
  solid2: {
    default: "light-dark(#2300abb2, #9176fed7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.11 0 0.627 / 0.695), color(display-p3 0.576 0.482 1 / 0.811))",
  },
  text1: {
    default: "light-dark(#1f0099af, #baa7ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.383 0.317 0.702), color(display-p3 0.72 0.65 1))",
  },
  text2: {
    default: "light-dark(#0b0043d9, #e3defffe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.179 0.15 0.359), color(display-p3 0.883 0.867 0.986))",
  },
});
