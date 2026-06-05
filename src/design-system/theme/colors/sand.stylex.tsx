import * as stylex from "@stylexjs/stylex";

export const sand = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfdfc, #111110)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.989), color(display-p3 0.067 0.067 0.063))",
  },
  bgSubtle: {
    default: "light-dark(#f9f9f8, #191918)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.977 0.977 0.973), color(display-p3 0.098 0.098 0.094))",
  },
  component1: {
    default: "light-dark(#f1f0ef, #222221)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.943 0.942 0.936), color(display-p3 0.135 0.135 0.129))",
  },
  component2: {
    default: "light-dark(#e9e8e6, #2a2a28)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.913 0.912 0.903), color(display-p3 0.164 0.163 0.156))",
  },
  component3: {
    default: "light-dark(#e2e1de, #31312e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.885 0.883 0.873), color(display-p3 0.193 0.192 0.183))",
  },
  border1: {
    default: "light-dark(#dad9d6, #3b3a37)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.854 0.852 0.839), color(display-p3 0.23 0.229 0.217))",
  },
  border2: {
    default: "light-dark(#cfceca, #494844)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.813 0.81 0.794), color(display-p3 0.285 0.282 0.267))",
  },
  border3: {
    default: "light-dark(#bcbbb5, #62605b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.738 0.734 0.713), color(display-p3 0.384 0.378 0.357))",
  },
  solid1: {
    default: "light-dark(#8d8d86, #6f6d66)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.553 0.553 0.528), color(display-p3 0.434 0.428 0.403))",
  },
  solid2: {
    default: "light-dark(#82827c, #7c7b74)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.511 0.511 0.488), color(display-p3 0.487 0.481 0.456))",
  },
  text1: {
    default: "light-dark(#63635e, #b5b3ad)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.388 0.388 0.37), color(display-p3 0.707 0.703 0.68))",
  },
  text2: {
    default: "light-dark(#21201c, #eeeeec)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.129 0.126 0.111), color(display-p3 0.933 0.933 0.926))",
  },
});
export const sandA = stylex.defineVars({
  bg: {
    default: "light-dark(#55550003, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.349 0.349 0.024 / 0.012), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#25250007, #f4f4f309)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.161 0.161 0.024 / 0.028), color(display-p3 0.992 0.992 0.988 / 0.034))",
  },
  component1: {
    default: "light-dark(#20100010, #f6f6f513)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.067 0.008 / 0.063), color(display-p3 0.996 0.996 0.992 / 0.072))",
  },
  component2: {
    default: "light-dark(#1f150019, #fefef31b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.129 0.129 0.012 / 0.099), color(display-p3 0.992 0.992 0.953 / 0.106))",
  },
  component3: {
    default: "light-dark(#1f180021, #fbfbeb23)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.098 0.067 0.008 / 0.126), color(display-p3 1 1 0.965 / 0.135))",
  },
  border1: {
    default: "light-dark(#19130029, #fffaed2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.102 0.075 0.004 / 0.161), color(display-p3 1 0.976 0.929 / 0.177))",
  },
  border2: {
    default: "light-dark(#19140035, #fffbed3c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.098 0.098 0.004 / 0.208), color(display-p3 1 0.984 0.929 / 0.236))",
  },
  border3: {
    default: "light-dark(#1915014a, #fff9eb57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.086 0.075 0.004 / 0.287), color(display-p3 1 0.976 0.925 / 0.341))",
  },
  solid1: {
    default: "light-dark(#0f0f0079, #fffae965)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.051 0.051 0.004 / 0.471), color(display-p3 1 0.98 0.925 / 0.395))",
  },
  solid2: {
    default: "light-dark(#0c0c0083, #fffdee73)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.047 0.047 0 / 0.514), color(display-p3 1 0.992 0.933 / 0.45))",
  },
  text1: {
    default: "light-dark(#080800a1, #fffcf4b0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.031 0.031 0 / 0.632), color(display-p3 1 0.996 0.961 / 0.685))",
  },
  text2: {
    default: "light-dark(#060500e3, #fffffded)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.02 0 / 0.891), color(display-p3 1 1 0.992 / 0.929))",
  },
});

export const sandInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#111110, #fdfdfc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.067 0.063), color(display-p3 0.992 0.992 0.989))",
  },
  bgSubtle: {
    default: "light-dark(#191918, #f9f9f8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.098 0.098 0.094), color(display-p3 0.977 0.977 0.973))",
  },
  component1: {
    default: "light-dark(#222221, #f1f0ef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.135 0.135 0.129), color(display-p3 0.943 0.942 0.936))",
  },
  component2: {
    default: "light-dark(#2a2a28, #e9e8e6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.164 0.163 0.156), color(display-p3 0.913 0.912 0.903))",
  },
  component3: {
    default: "light-dark(#31312e, #e2e1de)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.193 0.192 0.183), color(display-p3 0.885 0.883 0.873))",
  },
  border1: {
    default: "light-dark(#3b3a37, #dad9d6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.23 0.229 0.217), color(display-p3 0.854 0.852 0.839))",
  },
  border2: {
    default: "light-dark(#494844, #cfceca)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.285 0.282 0.267), color(display-p3 0.813 0.81 0.794))",
  },
  border3: {
    default: "light-dark(#62605b, #bcbbb5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.384 0.378 0.357), color(display-p3 0.738 0.734 0.713))",
  },
  solid1: {
    default: "light-dark(#6f6d66, #8d8d86)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.434 0.428 0.403), color(display-p3 0.553 0.553 0.528))",
  },
  solid2: {
    default: "light-dark(#7c7b74, #82827c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.487 0.481 0.456), color(display-p3 0.511 0.511 0.488))",
  },
  text1: {
    default: "light-dark(#b5b3ad, #63635e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.707 0.703 0.68), color(display-p3 0.388 0.388 0.37))",
  },
  text2: {
    default: "light-dark(#eeeeec, #21201c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.933 0.926), color(display-p3 0.129 0.126 0.111))",
  },
});
export const sandInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #55550003)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0.349 0.349 0.024 / 0.012))",
  },
  bgSubtle: {
    default: "light-dark(#f4f4f309, #25250007)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.988 / 0.034), color(display-p3 0.161 0.161 0.024 / 0.028))",
  },
  component1: {
    default: "light-dark(#f6f6f513, #20100010)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.996 0.996 0.992 / 0.072), color(display-p3 0.067 0.067 0.008 / 0.063))",
  },
  component2: {
    default: "light-dark(#fefef31b, #1f150019)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.953 / 0.106), color(display-p3 0.129 0.129 0.012 / 0.099))",
  },
  component3: {
    default: "light-dark(#fbfbeb23, #1f180021)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 0.965 / 0.135), color(display-p3 0.098 0.067 0.008 / 0.126))",
  },
  border1: {
    default: "light-dark(#fffaed2d, #19130029)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.976 0.929 / 0.177), color(display-p3 0.102 0.075 0.004 / 0.161))",
  },
  border2: {
    default: "light-dark(#fffbed3c, #19140035)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.984 0.929 / 0.236), color(display-p3 0.098 0.098 0.004 / 0.208))",
  },
  border3: {
    default: "light-dark(#fff9eb57, #1915014a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.976 0.925 / 0.341), color(display-p3 0.086 0.075 0.004 / 0.287))",
  },
  solid1: {
    default: "light-dark(#fffae965, #0f0f0079)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.98 0.925 / 0.395), color(display-p3 0.051 0.051 0.004 / 0.471))",
  },
  solid2: {
    default: "light-dark(#fffdee73, #0c0c0083)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.992 0.933 / 0.45), color(display-p3 0.047 0.047 0 / 0.514))",
  },
  text1: {
    default: "light-dark(#fffcf4b0, #080800a1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.996 0.961 / 0.685), color(display-p3 0.031 0.031 0 / 0.632))",
  },
  text2: {
    default: "light-dark(#fffffded, #060500e3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 1 0.992 / 0.929), color(display-p3 0.024 0.02 0 / 0.891))",
  },
});
