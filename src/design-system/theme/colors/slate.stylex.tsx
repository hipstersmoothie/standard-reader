import * as stylex from "@stylexjs/stylex";

export const slate = stylex.defineVars({
  bg: {
    default: "light-dark(#fcfcfd, #111113)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.988 0.992), color(display-p3 0.067 0.067 0.074))",
  },
  bgSubtle: {
    default: "light-dark(#f9f9fb, #18191b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.976 0.976 0.984), color(display-p3 0.095 0.098 0.105))",
  },
  component1: {
    default: "light-dark(#f0f0f3, #212225)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.94 0.941 0.953), color(display-p3 0.13 0.135 0.145))",
  },
  component2: {
    default: "light-dark(#e8e8ec, #272a2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.908 0.909 0.925), color(display-p3 0.156 0.163 0.176))",
  },
  component3: {
    default: "light-dark(#e0e1e6, #2e3135)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.88 0.881 0.901), color(display-p3 0.183 0.191 0.206))",
  },
  border1: {
    default: "light-dark(#d9d9e0, #363a3f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.85 0.852 0.876), color(display-p3 0.215 0.226 0.244))",
  },
  border2: {
    default: "light-dark(#cdced6, #43484e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.805 0.808 0.838), color(display-p3 0.265 0.28 0.302))",
  },
  border3: {
    default: "light-dark(#b9bbc6, #5a6169)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.727 0.733 0.773), color(display-p3 0.357 0.381 0.409))",
  },
  solid1: {
    default: "light-dark(#8b8d98, #696e77)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.547 0.553 0.592), color(display-p3 0.415 0.431 0.463))",
  },
  solid2: {
    default: "light-dark(#80838d, #777b84)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.503 0.512 0.549), color(display-p3 0.469 0.483 0.514))",
  },
  text1: {
    default: "light-dark(#60646c, #b0b4ba)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.379 0.392 0.421), color(display-p3 0.692 0.704 0.728))",
  },
  text2: {
    default: "light-dark(#1c2024, #edeef0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.113 0.125 0.14), color(display-p3 0.93 0.933 0.94))",
  },
});
export const slateA = stylex.defineVars({
  bg: {
    default: "light-dark(#00005503, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.024 0.349 / 0.012), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#00005506, #d8f4f609)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.024 0.349 / 0.024), color(display-p3 0.875 0.992 1 / 0.034))",
  },
  component1: {
    default: "light-dark(#0000330f, #ddeaf814)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.004 0.204 / 0.059), color(display-p3 0.882 0.933 0.992 / 0.077))",
  },
  component2: {
    default: "light-dark(#00002d17, #d3edf81d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.012 0.184 / 0.091), color(display-p3 0.882 0.953 0.996 / 0.111))",
  },
  component3: {
    default: "light-dark(#0009321f, #d9edfe25)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.039 0.2 / 0.122), color(display-p3 0.878 0.929 0.996 / 0.145))",
  },
  border1: {
    default: "light-dark(#00002f26, #d6ebfd30)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.008 0.165 / 0.15), color(display-p3 0.882 0.949 0.996 / 0.183))",
  },
  border2: {
    default: "light-dark(#00062e32, #d9edff40)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.027 0.184 / 0.197), color(display-p3 0.882 0.929 1 / 0.246))",
  },
  border3: {
    default: "light-dark(#00083046, #d9edff5d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.031 0.176 / 0.275), color(display-p3 0.871 0.937 1 / 0.361))",
  },
  solid1: {
    default: "light-dark(#00051d74, #dfebfd6d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.02 0.106 / 0.455), color(display-p3 0.898 0.937 1 / 0.42))",
  },
  solid2: {
    default: "light-dark(#00071b7f, #e5edfd7b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.027 0.098 / 0.499), color(display-p3 0.918 0.945 1 / 0.475))",
  },
  text1: {
    default: "light-dark(#0007149f, #f1f7feb5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.02 0.063 / 0.62), color(display-p3 0.949 0.969 0.996 / 0.708))",
  },
  text2: {
    default: "light-dark(#000509e3, #fcfdffef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.012 0.031 / 0.887), color(display-p3 0.988 0.992 1 / 0.937))",
  },
});

export const slateInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#111113, #fcfcfd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.067 0.074), color(display-p3 0.988 0.988 0.992))",
  },
  bgSubtle: {
    default: "light-dark(#18191b, #f9f9fb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.095 0.098 0.105), color(display-p3 0.976 0.976 0.984))",
  },
  component1: {
    default: "light-dark(#212225, #f0f0f3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.13 0.135 0.145), color(display-p3 0.94 0.941 0.953))",
  },
  component2: {
    default: "light-dark(#272a2d, #e8e8ec)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.156 0.163 0.176), color(display-p3 0.908 0.909 0.925))",
  },
  component3: {
    default: "light-dark(#2e3135, #e0e1e6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.183 0.191 0.206), color(display-p3 0.88 0.881 0.901))",
  },
  border1: {
    default: "light-dark(#363a3f, #d9d9e0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.215 0.226 0.244), color(display-p3 0.85 0.852 0.876))",
  },
  border2: {
    default: "light-dark(#43484e, #cdced6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.265 0.28 0.302), color(display-p3 0.805 0.808 0.838))",
  },
  border3: {
    default: "light-dark(#5a6169, #b9bbc6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.357 0.381 0.409), color(display-p3 0.727 0.733 0.773))",
  },
  solid1: {
    default: "light-dark(#696e77, #8b8d98)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.415 0.431 0.463), color(display-p3 0.547 0.553 0.592))",
  },
  solid2: {
    default: "light-dark(#777b84, #80838d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.469 0.483 0.514), color(display-p3 0.503 0.512 0.549))",
  },
  text1: {
    default: "light-dark(#b0b4ba, #60646c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.692 0.704 0.728), color(display-p3 0.379 0.392 0.421))",
  },
  text2: {
    default: "light-dark(#edeef0, #1c2024)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.93 0.933 0.94), color(display-p3 0.113 0.125 0.14))",
  },
});
export const slateInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #00005503)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0.024 0.024 0.349 / 0.012))",
  },
  bgSubtle: {
    default: "light-dark(#d8f4f609, #00005506)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.875 0.992 1 / 0.034), color(display-p3 0.024 0.024 0.349 / 0.024))",
  },
  component1: {
    default: "light-dark(#ddeaf814, #0000330f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.882 0.933 0.992 / 0.077), color(display-p3 0.004 0.004 0.204 / 0.059))",
  },
  component2: {
    default: "light-dark(#d3edf81d, #00002d17)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.882 0.953 0.996 / 0.111), color(display-p3 0.012 0.012 0.184 / 0.091))",
  },
  component3: {
    default: "light-dark(#d9edfe25, #0009321f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.878 0.929 0.996 / 0.145), color(display-p3 0.004 0.039 0.2 / 0.122))",
  },
  border1: {
    default: "light-dark(#d6ebfd30, #00002f26)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.882 0.949 0.996 / 0.183), color(display-p3 0.008 0.008 0.165 / 0.15))",
  },
  border2: {
    default: "light-dark(#d9edff40, #00062e32)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.882 0.929 1 / 0.246), color(display-p3 0.008 0.027 0.184 / 0.197))",
  },
  border3: {
    default: "light-dark(#d9edff5d, #00083046)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.871 0.937 1 / 0.361), color(display-p3 0.004 0.031 0.176 / 0.275))",
  },
  solid1: {
    default: "light-dark(#dfebfd6d, #00051d74)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.898 0.937 1 / 0.42), color(display-p3 0.004 0.02 0.106 / 0.455))",
  },
  solid2: {
    default: "light-dark(#e5edfd7b, #00071b7f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.918 0.945 1 / 0.475), color(display-p3 0.004 0.027 0.098 / 0.499))",
  },
  text1: {
    default: "light-dark(#f1f7feb5, #0007149f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.949 0.969 0.996 / 0.708), color(display-p3 0 0.02 0.063 / 0.62))",
  },
  text2: {
    default: "light-dark(#fcfdffef, #000509e3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.992 1 / 0.937), color(display-p3 0 0.012 0.031 / 0.887))",
  },
});
