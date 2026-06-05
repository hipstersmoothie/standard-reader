import * as stylex from "@stylexjs/stylex";

export const iris = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfdff, #13131e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.999), color(display-p3 0.075 0.075 0.114))",
  },
  bgSubtle: {
    default: "light-dark(#f8f8ff, #171625)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.972 0.973 0.998), color(display-p3 0.089 0.086 0.14))",
  },
  component1: {
    default: "light-dark(#f0f1fe, #202248)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.943 0.945 0.992), color(display-p3 0.128 0.134 0.272))",
  },
  component2: {
    default: "light-dark(#e6e7ff, #262a65)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.902 0.906 1), color(display-p3 0.153 0.165 0.382))",
  },
  component3: {
    default: "light-dark(#dadcff, #303374)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.857 0.861 1), color(display-p3 0.192 0.201 0.44))",
  },
  border1: {
    default: "light-dark(#cbcdff, #3d3e82)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.799 0.805 0.987), color(display-p3 0.239 0.241 0.491))",
  },
  border2: {
    default: "light-dark(#b8baf8, #4a4a95)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.721 0.727 0.955), color(display-p3 0.291 0.289 0.565))",
  },
  border3: {
    default: "light-dark(#9b9ef0, #5958b1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.61 0.619 0.918), color(display-p3 0.35 0.345 0.673))",
  },
  solid1: {
    default: "light-dark(#5b5bd6, #5b5bd6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.357 0.357 0.81), color(display-p3 0.357 0.357 0.81))",
  },
  solid2: {
    default: "light-dark(#5151cd, #6e6ade)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.318 0.318 0.774), color(display-p3 0.428 0.416 0.843))",
  },
  text1: {
    default: "light-dark(#5753c6, #b1a9ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.337 0.326 0.748), color(display-p3 0.685 0.662 1))",
  },
  text2: {
    default: "light-dark(#272962, #e0dffe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.154 0.161 0.371), color(display-p3 0.878 0.875 0.986))",
  },
});
export const irisA = stylex.defineVars({
  bg: {
    default: "light-dark(#0000ff02, #3636fe0e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.02 1 / 0.008), color(display-p3 0.224 0.224 0.992 / 0.051))",
  },
  bgSubtle: {
    default: "light-dark(#0000ff07, #564bf916)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.024 0.863 / 0.028), color(display-p3 0.361 0.314 1 / 0.08))",
  },
  component1: {
    default: "light-dark(#0011ee0f, #525bff3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.071 0.871 / 0.059), color(display-p3 0.357 0.373 1 / 0.219))",
  },
  component2: {
    default: "light-dark(#000bff19, #4d58ff5a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.051 1 / 0.099), color(display-p3 0.325 0.361 1 / 0.337))",
  },
  component3: {
    default: "light-dark(#000eff25, #5b62fd6b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.035 1 / 0.142), color(display-p3 0.38 0.4 1 / 0.4))",
  },
  border1: {
    default: "light-dark(#000aff34, #6d6ffd7a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.02 0.941 / 0.2), color(display-p3 0.447 0.447 1 / 0.454))",
  },
  border2: {
    default: "light-dark(#0008e647, #7777fe8e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.02 0.847 / 0.279), color(display-p3 0.486 0.486 1 / 0.534))",
  },
  border3: {
    default: "light-dark(#0008d964, #7b7afeac)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.024 0.788 / 0.389), color(display-p3 0.502 0.494 1 / 0.652))",
  },
  solid1: {
    default: "light-dark(#0000c0a4, #6a6afed4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0.706 / 0.644), color(display-p3 0.431 0.431 1 / 0.799))",
  },
  solid2: {
    default: "light-dark(#0000b6ae, #7d79ffdc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0.667 / 0.683), color(display-p3 0.502 0.486 1 / 0.832))",
  },
  text1: {
    default: "light-dark(#0600abac, #b1a9ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.337 0.326 0.748), color(display-p3 0.685 0.662 1))",
  },
  text2: {
    default: "light-dark(#000246d8, #e1e0fffe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.154 0.161 0.371), color(display-p3 0.878 0.875 0.986))",
  },
});
