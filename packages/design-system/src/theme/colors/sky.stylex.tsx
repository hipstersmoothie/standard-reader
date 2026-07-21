import * as stylex from "@stylexjs/stylex";

export const sky = stylex.defineVars({
  bg: {
    default: "light-dark(#f9feff, #0d141f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 0.995 0.999), color(display-p3 0.056 0.078 0.116))",
  },
  bgSubtle: {
    default: "light-dark(#f1fafd, #111a27)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.98 0.99), color(display-p3 0.075 0.101 0.149))",
  },
  component1: {
    default: "light-dark(#e1f6fd, #112840)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.899 0.963 0.989), color(display-p3 0.089 0.154 0.244))",
  },
  component2: {
    default: "light-dark(#d1f0fa, #113555)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.842 0.937 0.977), color(display-p3 0.106 0.207 0.323))",
  },
  component3: {
    default: "light-dark(#bee7f5, #154467)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.777 0.9 0.954), color(display-p3 0.135 0.261 0.394))",
  },
  border1: {
    default: "light-dark(#a9daed, #1b537b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.701 0.851 0.921), color(display-p3 0.17 0.322 0.469))",
  },
  border2: {
    default: "light-dark(#8dcae3, #1f6692)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.604 0.785 0.879), color(display-p3 0.205 0.394 0.557))",
  },
  border3: {
    default: "light-dark(#60b3d7, #197cae)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.457 0.696 0.829), color(display-p3 0.232 0.48 0.665))",
  },
  solid1: {
    default: "light-dark(#7ce2fe, #7ce2fe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.585 0.877 0.983), color(display-p3 0.585 0.877 0.983))",
  },
  solid2: {
    default: "light-dark(#74daf8, #a8eeff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.555 0.845 0.959), color(display-p3 0.718 0.925 0.991))",
  },
  text1: {
    default: "light-dark(#00749e, #75c7f0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.193 0.448 0.605), color(display-p3 0.536 0.772 0.924))",
  },
  text2: {
    default: "light-dark(#1d3e56, #c2f3ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.145 0.241 0.329), color(display-p3 0.799 0.947 0.993))",
  },
});
export const skyA = stylex.defineVars({
  bg: {
    default: "light-dark(#00d5ff06, #0044ff0f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.804 1 / 0.02), color(display-p3 0 0.282 0.996 / 0.055))",
  },
  bgSubtle: {
    default: "light-dark(#00a4db0e, #1171fb18)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.592 0.757 / 0.048), color(display-p3 0.157 0.467 0.992 / 0.089))",
  },
  component1: {
    default: "light-dark(#00b3ee1e, #1184fc33)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.655 0.886 / 0.102), color(display-p3 0.192 0.522 0.996 / 0.19))",
  },
  component2: {
    default: "light-dark(#00ace42e, #128fff49)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.604 0.851 / 0.157), color(display-p3 0.212 0.584 1 / 0.274))",
  },
  component3: {
    default: "light-dark(#00a1d841, #1c9dfd5d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.565 0.792 / 0.224), color(display-p3 0.259 0.631 1 / 0.349))",
  },
  border1: {
    default: "light-dark(#0092ca56, #28a5ff72)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.502 0.737 / 0.299), color(display-p3 0.302 0.655 1 / 0.433))",
  },
  border2: {
    default: "light-dark(#0089c172, #2badfe8b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.459 0.694 / 0.397), color(display-p3 0.329 0.686 1 / 0.526))",
  },
  border3: {
    default: "light-dark(#0085bf9f, #1db2fea9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.435 0.682 / 0.542), color(display-p3 0.325 0.71 1 / 0.643))",
  },
  solid1: {
    default: "light-dark(#00c7fe83, #7ce3fffe)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.71 0.965 / 0.416), color(display-p3 0.592 0.894 1 / 0.984))",
  },
  solid2: {
    default: "light-dark(#00bcf38b, #a8eeff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.647 0.914 / 0.444), color(display-p3 0.722 0.933 1 / 0.992))",
  },
  text1: {
    default: "light-dark(#00749e, #7cd3ffef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.193 0.448 0.605), color(display-p3 0.536 0.772 0.924))",
  },
  text2: {
    default: "light-dark(#002540e2, #c2f3ff)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.145 0.241 0.329), color(display-p3 0.799 0.947 0.993))",
  },
});
