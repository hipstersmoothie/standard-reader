import * as stylex from "@stylexjs/stylex";

export const grass = stylex.defineVars({
  bg: {
    default: "light-dark(#fbfefb, #0e1511)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.986 0.996 0.985), color(display-p3 0.062 0.083 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#f5fbf5, #141a15)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.966 0.983 0.964), color(display-p3 0.083 0.103 0.085))",
  },
  component1: {
    default: "light-dark(#e9f6e9, #1b2a1e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.923 0.965 0.917), color(display-p3 0.118 0.163 0.122))",
  },
  component2: {
    default: "light-dark(#daf1db, #1d3a24)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.872 0.94 0.865), color(display-p3 0.142 0.225 0.15))",
  },
  component3: {
    default: "light-dark(#c9e8ca, #25482d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.811 0.908 0.802), color(display-p3 0.178 0.279 0.186))",
  },
  border1: {
    default: "light-dark(#b2ddb5, #2d5736)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.733 0.864 0.724), color(display-p3 0.217 0.337 0.224))",
  },
  border2: {
    default: "light-dark(#94ce9a, #366740)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.628 0.803 0.622), color(display-p3 0.258 0.4 0.264))",
  },
  border3: {
    default: "light-dark(#65ba74, #3e7949)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.477 0.72 0.482), color(display-p3 0.302 0.47 0.305))",
  },
  solid1: {
    default: "light-dark(#46a758, #46a758)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.38 0.647 0.378), color(display-p3 0.38 0.647 0.378))",
  },
  solid2: {
    default: "light-dark(#3e9b4f, #53b365)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.344 0.598 0.342), color(display-p3 0.426 0.694 0.426))",
  },
  text1: {
    default: "light-dark(#2a7e3b, #71d083)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.263 0.488 0.261), color(display-p3 0.535 0.807 0.542))",
  },
  text2: {
    default: "light-dark(#203c25, #c2f0c2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.151 0.233 0.153), color(display-p3 0.797 0.936 0.776))",
  },
});
export const grassA = stylex.defineVars({
  bg: {
    default: "light-dark(#00c00004, #00de1205)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.757 0.024 / 0.016), color(display-p3 0 0.992 0.071 / 0.017))",
  },
  bgSubtle: {
    default: "light-dark(#0099000a, #5ef7780a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.565 0.024 / 0.036), color(display-p3 0.482 0.996 0.584 / 0.038))",
  },
  component1: {
    default: "light-dark(#00970016, #70fe8c1b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.059 0.576 0.008 / 0.083), color(display-p3 0.549 0.992 0.588 / 0.106))",
  },
  component2: {
    default: "light-dark(#009f0725, #57ff802c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.035 0.565 0.008 / 0.134), color(display-p3 0.51 0.996 0.557 / 0.169))",
  },
  component3: {
    default: "light-dark(#00930536, #68ff8b3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.047 0.545 0.008 / 0.197), color(display-p3 0.553 1 0.588 / 0.227))",
  },
  border1: {
    default: "light-dark(#008f0a4d, #71ff8f4b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.031 0.502 0.004 / 0.275), color(display-p3 0.584 1 0.608 / 0.29))",
  },
  border2: {
    default: "light-dark(#018b0f6b, #77fd925d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.482 0.004 / 0.377), color(display-p3 0.604 1 0.616 / 0.358))",
  },
  border3: {
    default: "light-dark(#008d199a, #77fd9070)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.467 0.008 / 0.522), color(display-p3 0.608 1 0.62 / 0.433))",
  },
  solid1: {
    default: "light-dark(#008619b9, #65ff82a1)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.435 0 / 0.624), color(display-p3 0.573 1 0.569 / 0.622))",
  },
  solid2: {
    default: "light-dark(#007b17c1, #72ff8dae)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.388 0 / 0.659), color(display-p3 0.6 0.996 0.6 / 0.673))",
  },
  text1: {
    default: "light-dark(#006514d5, #89ff9fcd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.263 0.488 0.261), color(display-p3 0.535 0.807 0.542))",
  },
  text2: {
    default: "light-dark(#002006df, #ceffceef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.151 0.233 0.153), color(display-p3 0.797 0.936 0.776))",
  },
});
