import * as stylex from "@stylexjs/stylex";

export const amber = stylex.defineVars({
  bg: {
    default: "light-dark(#fefdfb, #16120c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.992 0.985), color(display-p3 0.082 0.07 0.05))",
  },
  bgSubtle: {
    default: "light-dark(#fefbe9, #1d180f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.994 0.986 0.921), color(display-p3 0.111 0.094 0.064))",
  },
  component1: {
    default: "light-dark(#fff7c2, #302008)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.994 0.969 0.782), color(display-p3 0.178 0.128 0.049))",
  },
  component2: {
    default: "light-dark(#ffee9c, #3f2700)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.989 0.937 0.65), color(display-p3 0.239 0.156 0))",
  },
  component3: {
    default: "light-dark(#fbe577, #4d3000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.97 0.902 0.527), color(display-p3 0.29 0.193 0))",
  },
  border1: {
    default: "light-dark(#f3d673, #5c3d05)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.936 0.844 0.506), color(display-p3 0.344 0.245 0.076))",
  },
  border2: {
    default: "light-dark(#e9c162, #714f19)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.89 0.762 0.443), color(display-p3 0.422 0.314 0.141))",
  },
  border3: {
    default: "light-dark(#e2a336, #8f6424)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.85 0.65 0.3), color(display-p3 0.535 0.399 0.189))",
  },
  solid1: {
    default: "light-dark(#ffc53d, #ffc53d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.77 0.26), color(display-p3 1 0.77 0.26))",
  },
  solid2: {
    default: "light-dark(#ffba18, #ffd60a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.959 0.741 0.274), color(display-p3 1 0.87 0.15))",
  },
  text1: {
    default: "light-dark(#ab6400, #ffca16)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.64 0.4 0), color(display-p3 1 0.8 0.29))",
  },
  text2: {
    default: "light-dark(#4f3422, #ffe7b3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.294 0.208 0.145), color(display-p3 0.984 0.909 0.726))",
  },
});
export const amberA = stylex.defineVars({
  bg: {
    default: "light-dark(#c0800004, #e63c0006)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.514 0.024 / 0.016), color(display-p3 0.992 0.298 0 / 0.017))",
  },
  bgSubtle: {
    default: "light-dark(#f4d10016, #fd9b000d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.902 0.804 0.008 / 0.079), color(display-p3 0.988 0.651 0 / 0.047))",
  },
  component1: {
    default: "light-dark(#ffde003d, #fa820022)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.965 0.859 0.004 / 0.22), color(display-p3 1 0.6 0 / 0.118))",
  },
  component2: {
    default: "light-dark(#ffd40063, #fc820032)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.969 0.82 0.004 / 0.35), color(display-p3 1 0.557 0 / 0.185))",
  },
  component3: {
    default: "light-dark(#f8cf0088, #fd8b0041)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.796 0.004 / 0.475), color(display-p3 1 0.592 0 / 0.24))",
  },
  border1: {
    default: "light-dark(#eab5008c, #fd9b0051)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.875 0.682 0.004 / 0.495), color(display-p3 1 0.659 0.094 / 0.299))",
  },
  border2: {
    default: "light-dark(#dc9b009d, #ffab2567)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.804 0.573 0 / 0.557), color(display-p3 1 0.714 0.263 / 0.383))",
  },
  border3: {
    default: "light-dark(#da8a00c9, #ffae3587)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.788 0.502 0 / 0.699), color(display-p3 0.996 0.729 0.306 / 0.5))",
  },
  solid1: {
    default: "light-dark(#ffb300c2, #ffc53d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.686 0 / 0.742), color(display-p3 1 0.769 0.259))",
  },
  solid2: {
    default: "light-dark(#ffb300e7, #ffd60a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.945 0.643 0 / 0.726), color(display-p3 1 0.871 0.149))",
  },
  text1: {
    default: "light-dark(#ab6400, #ffca16)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.64 0.4 0), color(display-p3 1 0.8 0.29))",
  },
  text2: {
    default: "light-dark(#341500dd, #ffe7b3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.294 0.208 0.145), color(display-p3 0.984 0.909 0.726))",
  },
});
