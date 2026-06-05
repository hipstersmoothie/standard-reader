import * as stylex from "@stylexjs/stylex";

export const ruby = stylex.defineVars({
  bg: {
    default: "light-dark(#fffcfd, #191113)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.998 0.989 0.992), color(display-p3 0.093 0.068 0.074))",
  },
  bgSubtle: {
    default: "light-dark(#fff7f8, #1e1517)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.971 0.974), color(display-p3 0.113 0.083 0.089))",
  },
  component1: {
    default: "light-dark(#feeaed, #3a141e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.983 0.92 0.928), color(display-p3 0.208 0.088 0.117))",
  },
  component2: {
    default: "light-dark(#ffdce1, #4e1325)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.987 0.869 0.885), color(display-p3 0.279 0.092 0.147))",
  },
  component3: {
    default: "light-dark(#ffced6, #5e1a2e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.968 0.817 0.839), color(display-p3 0.337 0.12 0.18))",
  },
  border1: {
    default: "light-dark(#f8bfc8, #6f2539)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.937 0.758 0.786), color(display-p3 0.401 0.166 0.223))",
  },
  border2: {
    default: "light-dark(#efacb8, #883447)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.897 0.685 0.721), color(display-p3 0.495 0.224 0.281))",
  },
  border3: {
    default: "light-dark(#e592a3, #b3445a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.851 0.588 0.639), color(display-p3 0.652 0.295 0.359))",
  },
  solid1: {
    default: "light-dark(#e54666, #e54666)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.83 0.323 0.408), color(display-p3 0.83 0.323 0.408))",
  },
  solid2: {
    default: "light-dark(#dc3b5d, #ec5a72)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.795 0.286 0.375), color(display-p3 0.857 0.392 0.455))",
  },
  text1: {
    default: "light-dark(#ca244d, #ff949d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.728 0.211 0.311), color(display-p3 1 0.57 0.59))",
  },
  text2: {
    default: "light-dark(#64172b, #fed2e1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.36 0.115 0.171), color(display-p3 0.968 0.83 0.88))",
  },
});
export const rubyA = stylex.defineVars({
  bg: {
    default: "light-dark(#ff005503, #f4124a09)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.349 / 0.012), color(display-p3 0.984 0.071 0.329 / 0.03))",
  },
  bgSubtle: {
    default: "light-dark(#ff002008, #fe5a7f0e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.863 0.024 0.024 / 0.028), color(display-p3 0.992 0.376 0.529 / 0.051))",
  },
  component1: {
    default: "light-dark(#f3002515, #ff235d2c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.804 0.008 0.11 / 0.079), color(display-p3 0.996 0.196 0.404 / 0.152))",
  },
  component2: {
    default: "light-dark(#ff002523, #fd195e42)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.91 0.008 0.125 / 0.13), color(display-p3 1 0.173 0.416 / 0.227))",
  },
  component3: {
    default: "light-dark(#ff002a31, #fe2d6b53)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.004 0.133 / 0.185), color(display-p3 1 0.259 0.459 / 0.29))",
  },
  border1: {
    default: "light-dark(#e4002440, #ff447665)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.745 0.004 0.118 / 0.244), color(display-p3 1 0.341 0.506 / 0.358))",
  },
  border2: {
    default: "light-dark(#ce002553, #ff577d80)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.678 0.004 0.114 / 0.314), color(display-p3 1 0.412 0.541 / 0.458))",
  },
  border3: {
    default: "light-dark(#c300286d, #ff5c7cae)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.639 0.004 0.125 / 0.412), color(display-p3 1 0.431 0.537 / 0.627))",
  },
  solid1: {
    default: "light-dark(#db002cb9, #fe4c70e4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.753 0 0.129 / 0.679), color(display-p3 1 0.376 0.482 / 0.82))",
  },
  solid2: {
    default: "light-dark(#d2002cc4, #ff617beb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.714 0 0.125 / 0.714), color(display-p3 1 0.447 0.522 / 0.849))",
  },
  text1: {
    default: "light-dark(#c10030db, #ff949d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.728 0.211 0.311), color(display-p3 1 0.57 0.59))",
  },
  text2: {
    default: "light-dark(#550016e8, #ffd3e2fe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.36 0.115 0.171), color(display-p3 0.968 0.83 0.88))",
  },
});
