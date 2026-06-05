import * as stylex from "@stylexjs/stylex";

export const olive = stylex.defineVars({
  bg: {
    default: "light-dark(#fcfdfc, #111210)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.989 0.992 0.989), color(display-p3 0.067 0.07 0.063))",
  },
  bgSubtle: {
    default: "light-dark(#f8faf8, #181917)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.974 0.98 0.973), color(display-p3 0.095 0.098 0.091))",
  },
  component1: {
    default: "light-dark(#eff1ef, #212220)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.939 0.945 0.937), color(display-p3 0.131 0.135 0.126))",
  },
  component2: {
    default: "light-dark(#e7e9e7, #282a27)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.907 0.914 0.905), color(display-p3 0.158 0.163 0.153))",
  },
  component3: {
    default: "light-dark(#dfe2df, #2f312e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.878 0.885 0.875), color(display-p3 0.186 0.192 0.18))",
  },
  border1: {
    default: "light-dark(#d7dad7, #383a36)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.846 0.855 0.843), color(display-p3 0.221 0.229 0.215))",
  },
  border2: {
    default: "light-dark(#cccfcc, #454843)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.803 0.812 0.8), color(display-p3 0.273 0.284 0.266))",
  },
  border3: {
    default: "light-dark(#b9bcb8, #5c625b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.727 0.738 0.723), color(display-p3 0.365 0.382 0.359))",
  },
  solid1: {
    default: "light-dark(#898e87, #687066)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.541 0.556 0.532), color(display-p3 0.414 0.438 0.404))",
  },
  solid2: {
    default: "light-dark(#7f847d, #767d74)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.5 0.515 0.491), color(display-p3 0.467 0.49 0.458))",
  },
  text1: {
    default: "light-dark(#60655f, #afb5ad)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.38 0.395 0.374), color(display-p3 0.69 0.709 0.682))",
  },
  text2: {
    default: "light-dark(#1d211c, #eceeec)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.117 0.129 0.111), color(display-p3 0.927 0.933 0.926))",
  },
});
export const oliveA = stylex.defineVars({
  bg: {
    default: "light-dark(#00550003, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.349 0.024 / 0.012), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#00490007, #f1f2f008)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.302 0.024 / 0.028), color(display-p3 0.984 0.988 0.976 / 0.03))",
  },
  component1: {
    default: "light-dark(#00200010, #f4f5f312)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.129 0.008 / 0.063), color(display-p3 0.992 0.996 0.988 / 0.068))",
  },
  component2: {
    default: "light-dark(#00160018, #f3fef21a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.094 0.012 / 0.095), color(display-p3 0.953 0.996 0.949 / 0.102))",
  },
  component3: {
    default: "light-dark(#00180020, #f2fbf122)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.035 0.098 0.008 / 0.126), color(display-p3 0.969 1 0.965 / 0.131))",
  },
  border1: {
    default: "light-dark(#00140028, #f4faed2c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.027 0.078 0.004 / 0.157), color(display-p3 0.973 1 0.969 / 0.169))",
  },
  border2: {
    default: "light-dark(#000f0033, #f2fced3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.059 0 / 0.2), color(display-p3 0.98 1 0.961 / 0.228))",
  },
  border3: {
    default: "light-dark(#040f0047, #edfdeb57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.059 0.004 / 0.279), color(display-p3 0.961 1 0.957 / 0.334))",
  },
  solid1: {
    default: "light-dark(#050f0078, #ebfde766)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.051 0.004 / 0.467), color(display-p3 0.949 1 0.922 / 0.397))",
  },
  solid2: {
    default: "light-dark(#040e0082, #f0fdec74)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.047 0 / 0.51), color(display-p3 0.953 1 0.941 / 0.452))",
  },
  text1: {
    default: "light-dark(#020a00a0, #f6fef4b0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.039 0 / 0.628), color(display-p3 0.976 1 0.965 / 0.688))",
  },
  text2: {
    default: "light-dark(#010600e3, #fdfffded)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.024 0 / 0.891), color(display-p3 0.992 1 0.992 / 0.929))",
  },
});

export const oliveInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#111210, #fcfdfc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.07 0.063), color(display-p3 0.989 0.992 0.989))",
  },
  bgSubtle: {
    default: "light-dark(#181917, #f8faf8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.095 0.098 0.091), color(display-p3 0.974 0.98 0.973))",
  },
  component1: {
    default: "light-dark(#212220, #eff1ef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.131 0.135 0.126), color(display-p3 0.939 0.945 0.937))",
  },
  component2: {
    default: "light-dark(#282a27, #e7e9e7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.158 0.163 0.153), color(display-p3 0.907 0.914 0.905))",
  },
  component3: {
    default: "light-dark(#2f312e, #dfe2df)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.186 0.192 0.18), color(display-p3 0.878 0.885 0.875))",
  },
  border1: {
    default: "light-dark(#383a36, #d7dad7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.221 0.229 0.215), color(display-p3 0.846 0.855 0.843))",
  },
  border2: {
    default: "light-dark(#454843, #cccfcc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.273 0.284 0.266), color(display-p3 0.803 0.812 0.8))",
  },
  border3: {
    default: "light-dark(#5c625b, #b9bcb8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.365 0.382 0.359), color(display-p3 0.727 0.738 0.723))",
  },
  solid1: {
    default: "light-dark(#687066, #898e87)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.414 0.438 0.404), color(display-p3 0.541 0.556 0.532))",
  },
  solid2: {
    default: "light-dark(#767d74, #7f847d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.467 0.49 0.458), color(display-p3 0.5 0.515 0.491))",
  },
  text1: {
    default: "light-dark(#afb5ad, #60655f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.69 0.709 0.682), color(display-p3 0.38 0.395 0.374))",
  },
  text2: {
    default: "light-dark(#eceeec, #1d211c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.927 0.933 0.926), color(display-p3 0.117 0.129 0.111))",
  },
});
export const oliveInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #00550003)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0.024 0.349 0.024 / 0.012))",
  },
  bgSubtle: {
    default: "light-dark(#f1f2f008, #00490007)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.984 0.988 0.976 / 0.03), color(display-p3 0.024 0.302 0.024 / 0.028))",
  },
  component1: {
    default: "light-dark(#f4f5f312, #00200010)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.996 0.988 / 0.068), color(display-p3 0.008 0.129 0.008 / 0.063))",
  },
  component2: {
    default: "light-dark(#f3fef21a, #00160018)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.996 0.949 / 0.102), color(display-p3 0.012 0.094 0.012 / 0.095))",
  },
  component3: {
    default: "light-dark(#f2fbf122, #00180020)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.969 1 0.965 / 0.131), color(display-p3 0.035 0.098 0.008 / 0.126))",
  },
  border1: {
    default: "light-dark(#f4faed2c, #00140028)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.973 1 0.969 / 0.169), color(display-p3 0.027 0.078 0.004 / 0.157))",
  },
  border2: {
    default: "light-dark(#f2fced3b, #000f0033)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 1 0.961 / 0.228), color(display-p3 0.02 0.059 0 / 0.2))",
  },
  border3: {
    default: "light-dark(#edfdeb57, #040f0047)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.961 1 0.957 / 0.334), color(display-p3 0.02 0.059 0.004 / 0.279))",
  },
  solid1: {
    default: "light-dark(#ebfde766, #050f0078)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.949 1 0.922 / 0.397), color(display-p3 0.02 0.051 0.004 / 0.467))",
  },
  solid2: {
    default: "light-dark(#f0fdec74, #040e0082)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 1 0.941 / 0.452), color(display-p3 0.024 0.047 0 / 0.51))",
  },
  text1: {
    default: "light-dark(#f6fef4b0, #020a00a0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.976 1 0.965 / 0.688), color(display-p3 0.012 0.039 0 / 0.628))",
  },
  text2: {
    default: "light-dark(#fdfffded, #010600e3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 1 0.992 / 0.929), color(display-p3 0.008 0.024 0 / 0.891))",
  },
});
