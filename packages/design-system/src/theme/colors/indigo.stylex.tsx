import * as stylex from "@stylexjs/stylex";

export const indigo = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfdfe, #11131f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.996), color(display-p3 0.068 0.074 0.118))",
  },
  bgSubtle: {
    default: "light-dark(#f7f9ff, #141726)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.971 0.977 0.998), color(display-p3 0.081 0.089 0.144))",
  },
  component1: {
    default: "light-dark(#edf2fe, #182449)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.948 0.992), color(display-p3 0.105 0.141 0.275))",
  },
  component2: {
    default: "light-dark(#e1e9ff, #1d2e62)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.885 0.914 1), color(display-p3 0.129 0.18 0.369))",
  },
  component3: {
    default: "light-dark(#d2deff, #253974)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.87 1), color(display-p3 0.163 0.22 0.439))",
  },
  border1: {
    default: "light-dark(#c1d0ff, #304384)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.767 0.814 0.995), color(display-p3 0.203 0.262 0.5))",
  },
  border2: {
    default: "light-dark(#abbdf9, #3a4f97)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.685 0.74 0.957), color(display-p3 0.245 0.309 0.575))",
  },
  border3: {
    default: "light-dark(#8da4ef, #435db1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.569 0.639 0.916), color(display-p3 0.285 0.362 0.674))",
  },
  solid1: {
    default: "light-dark(#3e63dd, #3e63dd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.276 0.384 0.837), color(display-p3 0.276 0.384 0.837))",
  },
  solid2: {
    default: "light-dark(#3358d4, #5472e4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.234 0.343 0.801), color(display-p3 0.354 0.445 0.866))",
  },
  text1: {
    default: "light-dark(#3a5bc7, #9eb1ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.256 0.354 0.755), color(display-p3 0.63 0.69 1))",
  },
  text2: {
    default: "light-dark(#1f2d5c, #d6e1ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.133 0.175 0.348), color(display-p3 0.848 0.881 0.99))",
  },
});
export const indigoA = stylex.defineVars({
  bg: {
    default: "light-dark(#00008002, #1133ff0f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.02 0.51 / 0.008), color(display-p3 0.071 0.212 0.996 / 0.055))",
  },
  bgSubtle: {
    default: "light-dark(#0040ff08, #3354fa17)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.161 0.863 / 0.028), color(display-p3 0.251 0.345 0.988 / 0.085))",
  },
  component1: {
    default: "light-dark(#0047f112, #2f62ff3c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.239 0.886 / 0.067), color(display-p3 0.243 0.404 1 / 0.223))",
  },
  component2: {
    default: "light-dark(#0044ff1e, #3566ff57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.247 1 / 0.114), color(display-p3 0.263 0.42 1 / 0.324))",
  },
  component3: {
    default: "light-dark(#0044ff2d, #4171fd6b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.235 1 / 0.169), color(display-p3 0.314 0.451 1 / 0.4))",
  },
  border1: {
    default: "light-dark(#003eff3e, #5178fd7c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.208 0.984 / 0.232), color(display-p3 0.361 0.49 1 / 0.467))",
  },
  border2: {
    default: "light-dark(#0037ed54, #5a7fff90)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.176 0.863 / 0.314), color(display-p3 0.388 0.51 1 / 0.547))",
  },
  border3: {
    default: "light-dark(#0034dc72, #5b81feac)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.165 0.812 / 0.432), color(display-p3 0.404 0.518 1 / 0.652))",
  },
  solid1: {
    default: "light-dark(#0031d2c1, #4671ffdb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.153 0.773 / 0.726), color(display-p3 0.318 0.451 1 / 0.824))",
  },
  solid2: {
    default: "light-dark(#002ec9cc, #5c7efee3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.137 0.737 / 0.765), color(display-p3 0.404 0.506 1 / 0.858))",
  },
  text1: {
    default: "light-dark(#002bb7c5, #9eb1ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.256 0.354 0.755), color(display-p3 0.63 0.69 1))",
  },
  text2: {
    default: "light-dark(#001046e0, #d6e1ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.133 0.175 0.348), color(display-p3 0.848 0.881 0.99))",
  },
});
