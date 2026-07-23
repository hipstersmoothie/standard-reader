import * as stylex from "@stylexjs/stylex";

export const tomato = stylex.defineVars({
  bg: {
    default: "light-dark(#fffcfc, #181111)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.998 0.989 0.988), color(display-p3 0.09 0.068 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#fff8f7, #1f1513)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.994 0.974 0.969), color(display-p3 0.115 0.084 0.076))",
  },
  component1: {
    default: "light-dark(#feebe7, #391714)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.985 0.924 0.909), color(display-p3 0.205 0.097 0.083))",
  },
  component2: {
    default: "light-dark(#ffdcd3, #4e1511)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.996 0.868 0.835), color(display-p3 0.282 0.099 0.077))",
  },
  component3: {
    default: "light-dark(#ffcdc2, #5e1c16)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 0.812 0.77), color(display-p3 0.339 0.129 0.101))",
  },
  border1: {
    default: "light-dark(#fdbdaf, #6e2920)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.75 0.698), color(display-p3 0.398 0.179 0.141))",
  },
  border2: {
    default: "light-dark(#f5a898, #853a2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.917 0.673 0.611), color(display-p3 0.487 0.245 0.194))",
  },
  border3: {
    default: "light-dark(#ec8e7b, #ac4d39)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.875 0.575 0.502), color(display-p3 0.629 0.322 0.248))",
  },
  solid1: {
    default: "light-dark(#e54d2e, #e54d2e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.345 0.231), color(display-p3 0.831 0.345 0.231))",
  },
  solid2: {
    default: "light-dark(#dd4425, #ec6142)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.802 0.313 0.2), color(display-p3 0.862 0.415 0.298))",
  },
  text1: {
    default: "light-dark(#d13415, #ff977d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.755 0.259 0.152), color(display-p3 1 0.585 0.455))",
  },
  text2: {
    default: "light-dark(#5c271f, #fbd3cb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.335 0.165 0.132), color(display-p3 0.959 0.833 0.802))",
  },
});
export const tomatoA = stylex.defineVars({
  bg: {
    default: "light-dark(#ff000003, #f1121208)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.024 / 0.012), color(display-p3 0.973 0.071 0.071 / 0.026))",
  },
  bgSubtle: {
    default: "light-dark(#ff200008, #ff55330f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.145 0.02 / 0.032), color(display-p3 0.992 0.376 0.224 / 0.051))",
  },
  component1: {
    default: "light-dark(#f52b0018, #ff35232b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.184 0.012 / 0.091), color(display-p3 0.996 0.282 0.176 / 0.148))",
  },
  component2: {
    default: "light-dark(#ff35002c, #fd201142)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.976 0.192 0.004 / 0.165), color(display-p3 1 0.204 0.118 / 0.232))",
  },
  component3: {
    default: "light-dark(#ff2e003d, #fe332153)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.918 0.192 0.004 / 0.232), color(display-p3 1 0.286 0.192 / 0.29))",
  },
  border1: {
    default: "light-dark(#f92d0050, #ff4f3864)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.847 0.173 0.004 / 0.302), color(display-p3 1 0.392 0.278 / 0.353))",
  },
  border2: {
    default: "light-dark(#e7280067, #fd644a7d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.788 0.165 0.004 / 0.389), color(display-p3 1 0.459 0.349 / 0.45))",
  },
  border3: {
    default: "light-dark(#db250084, #fe6d4ea7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.749 0.153 0.004 / 0.499), color(display-p3 1 0.49 0.369 / 0.601))",
  },
  solid1: {
    default: "light-dark(#df2600d1, #fe5431e4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.78 0.149 0 / 0.769), color(display-p3 1 0.408 0.267 / 0.82))",
  },
  solid2: {
    default: "light-dark(#d72400da, #ff6847eb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.141 0 / 0.8), color(display-p3 1 0.478 0.341 / 0.853))",
  },
  text1: {
    default: "light-dark(#cd2200ea, #ff977d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.755 0.259 0.152), color(display-p3 1 0.585 0.455))",
  },
  text2: {
    default: "light-dark(#460900e0, #ffd6cefb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.335 0.165 0.132), color(display-p3 0.959 0.833 0.802))",
  },
});
