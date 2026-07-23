import * as stylex from "@stylexjs/stylex";

export const gray = stylex.defineVars({
  bg: {
    default: "light-dark(#fcfcfc, #111111)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.988 0.988), color(display-p3 0.067 0.067 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#f9f9f9, #191919)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.975 0.975 0.975), color(display-p3 0.098 0.098 0.098))",
  },
  component1: {
    default: "light-dark(#f0f0f0, #222222)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.939 0.939 0.939), color(display-p3 0.135 0.135 0.135))",
  },
  component2: {
    default: "light-dark(#e8e8e8, #2a2a2a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.908 0.908 0.908), color(display-p3 0.163 0.163 0.163))",
  },
  component3: {
    default: "light-dark(#e0e0e0, #313131)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.88 0.88 0.88), color(display-p3 0.192 0.192 0.192))",
  },
  border1: {
    default: "light-dark(#d9d9d9, #3a3a3a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.849 0.849 0.849), color(display-p3 0.228 0.228 0.228))",
  },
  border2: {
    default: "light-dark(#cecece, #484848)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.807 0.807 0.807), color(display-p3 0.283 0.283 0.283))",
  },
  border3: {
    default: "light-dark(#bbbbbb, #606060)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.732 0.732 0.732), color(display-p3 0.375 0.375 0.375))",
  },
  solid1: {
    default: "light-dark(#8d8d8d, #6e6e6e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.553 0.553 0.553), color(display-p3 0.431 0.431 0.431))",
  },
  solid2: {
    default: "light-dark(#838383, #7b7b7b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.512 0.512 0.512), color(display-p3 0.484 0.484 0.484))",
  },
  text1: {
    default: "light-dark(#646464, #b4b4b4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.392 0.392 0.392), color(display-p3 0.706 0.706 0.706))",
  },
  text2: {
    default: "light-dark(#202020, #eeeeee)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.125 0.125 0.125), color(display-p3 0.933 0.933 0.933))",
  },
});
export const grayA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000003, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.012), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#00000006, #ffffff09)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.024), color(display-p3 1 1 1 / 0.034))",
  },
  component1: {
    default: "light-dark(#0000000f, #ffffff12)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.063), color(display-p3 1 1 1 / 0.071))",
  },
  component2: {
    default: "light-dark(#00000017, #ffffff1b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.09), color(display-p3 1 1 1 / 0.105))",
  },
  component3: {
    default: "light-dark(#0000001f, #ffffff22)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.122), color(display-p3 1 1 1 / 0.134))",
  },
  border1: {
    default: "light-dark(#00000026, #ffffff2c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.153), color(display-p3 1 1 1 / 0.172))",
  },
  border2: {
    default: "light-dark(#00000031, #ffffff3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.192), color(display-p3 1 1 1 / 0.231))",
  },
  border3: {
    default: "light-dark(#00000044, #ffffff55)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.267), color(display-p3 1 1 1 / 0.332))",
  },
  solid1: {
    default: "light-dark(#00000072, #ffffff64)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.447), color(display-p3 1 1 1 / 0.391))",
  },
  solid2: {
    default: "light-dark(#0000007c, #ffffff72)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.486), color(display-p3 1 1 1 / 0.445))",
  },
  text1: {
    default: "light-dark(#0000009b, #ffffffaf)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.608), color(display-p3 1 1 1 / 0.685))",
  },
  text2: {
    default: "light-dark(#000000df, #ffffffed)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0.875), color(display-p3 1 1 1 / 0.929))",
  },
});

export const grayInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#111111, #fcfcfc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.067 0.067), color(display-p3 0.988 0.988 0.988))",
  },
  bgSubtle: {
    default: "light-dark(#191919, #f9f9f9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.098 0.098 0.098), color(display-p3 0.975 0.975 0.975))",
  },
  component1: {
    default: "light-dark(#222222, #f0f0f0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.135 0.135 0.135), color(display-p3 0.939 0.939 0.939))",
  },
  component2: {
    default: "light-dark(#2a2a2a, #e8e8e8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.163 0.163 0.163), color(display-p3 0.908 0.908 0.908))",
  },
  component3: {
    default: "light-dark(#313131, #e0e0e0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.192 0.192 0.192), color(display-p3 0.88 0.88 0.88))",
  },
  border1: {
    default: "light-dark(#3a3a3a, #d9d9d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.228 0.228 0.228), color(display-p3 0.849 0.849 0.849))",
  },
  border2: {
    default: "light-dark(#484848, #cecece)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.283 0.283 0.283), color(display-p3 0.807 0.807 0.807))",
  },
  border3: {
    default: "light-dark(#606060, #bbbbbb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.375 0.375 0.375), color(display-p3 0.732 0.732 0.732))",
  },
  solid1: {
    default: "light-dark(#6e6e6e, #8d8d8d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.431 0.431 0.431), color(display-p3 0.553 0.553 0.553))",
  },
  solid2: {
    default: "light-dark(#7b7b7b, #838383)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.484 0.484 0.484), color(display-p3 0.512 0.512 0.512))",
  },
  text1: {
    default: "light-dark(#b4b4b4, #646464)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.706 0.706 0.706), color(display-p3 0.392 0.392 0.392))",
  },
  text2: {
    default: "light-dark(#eeeeee, #202020)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.933 0.933), color(display-p3 0.125 0.125 0.125))",
  },
});
export const grayInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #00000003)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0 0 0 / 0.012))",
  },
  bgSubtle: {
    default: "light-dark(#ffffff09, #00000006)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.034), color(display-p3 0 0 0 / 0.024))",
  },
  component1: {
    default: "light-dark(#ffffff12, #0000000f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.071), color(display-p3 0 0 0 / 0.063))",
  },
  component2: {
    default: "light-dark(#ffffff1b, #00000017)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.105), color(display-p3 0 0 0 / 0.09))",
  },
  component3: {
    default: "light-dark(#ffffff22, #0000001f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.134), color(display-p3 0 0 0 / 0.122))",
  },
  border1: {
    default: "light-dark(#ffffff2c, #00000026)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.172), color(display-p3 0 0 0 / 0.153))",
  },
  border2: {
    default: "light-dark(#ffffff3b, #00000031)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.231), color(display-p3 0 0 0 / 0.192))",
  },
  border3: {
    default: "light-dark(#ffffff55, #00000044)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.332), color(display-p3 0 0 0 / 0.267))",
  },
  solid1: {
    default: "light-dark(#ffffff64, #00000072)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.391), color(display-p3 0 0 0 / 0.447))",
  },
  solid2: {
    default: "light-dark(#ffffff72, #0000007c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.445), color(display-p3 0 0 0 / 0.486))",
  },
  text1: {
    default: "light-dark(#ffffffaf, #0000009b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.685), color(display-p3 0 0 0 / 0.608))",
  },
  text2: {
    default: "light-dark(#ffffffed, #000000df)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 1 / 0.929), color(display-p3 0 0 0 / 0.875))",
  },
});
