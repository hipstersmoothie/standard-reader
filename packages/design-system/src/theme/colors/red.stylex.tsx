import * as stylex from "@stylexjs/stylex";

export const red = stylex.defineVars({
  bg: {
    default: "light-dark(#fffcfc, #191111)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.998 0.989 0.988), color(display-p3 0.093 0.068 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#fff7f7, #201314)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.971 0.971), color(display-p3 0.118 0.077 0.079))",
  },
  component1: {
    default: "light-dark(#feebec, #3b1219)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.985 0.925 0.925), color(display-p3 0.211 0.081 0.099))",
  },
  component2: {
    default: "light-dark(#ffdbdc, #500f1c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.999 0.866 0.866), color(display-p3 0.287 0.079 0.113))",
  },
  component3: {
    default: "light-dark(#ffcdce, #611623)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.984 0.812 0.811), color(display-p3 0.348 0.11 0.142))",
  },
  border1: {
    default: "light-dark(#fdbdbe, #72232d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.955 0.751 0.749), color(display-p3 0.414 0.16 0.183))",
  },
  border2: {
    default: "light-dark(#f4a9aa, #8c333a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.915 0.675 0.672), color(display-p3 0.508 0.224 0.236))",
  },
  border3: {
    default: "light-dark(#eb8e90, #b54548)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.872 0.575 0.572), color(display-p3 0.659 0.298 0.297))",
  },
  solid1: {
    default: "light-dark(#e5484d, #e5484d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.83 0.329 0.324), color(display-p3 0.83 0.329 0.324))",
  },
  solid2: {
    default: "light-dark(#dc3e42, #ec5d5e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.798 0.294 0.285), color(display-p3 0.861 0.403 0.387))",
  },
  text1: {
    default: "light-dark(#ce2c31, #ff9592)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.744 0.234 0.222), color(display-p3 1 0.57 0.55))",
  },
  text2: {
    default: "light-dark(#641723, #ffd1d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.36 0.115 0.143), color(display-p3 0.971 0.826 0.852))",
  },
});
export const redA = stylex.defineVars({
  bg: {
    default: "light-dark(#ff000003, #f4121209)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.024 0.024 / 0.012), color(display-p3 0.984 0.071 0.071 / 0.03))",
  },
  bgSubtle: {
    default: "light-dark(#ff000008, #f22f3e11)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.863 0.024 0.024 / 0.028), color(display-p3 0.996 0.282 0.282 / 0.055))",
  },
  component1: {
    default: "light-dark(#f3000d14, #ff173f2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.792 0.008 0.008 / 0.075), color(display-p3 1 0.169 0.271 / 0.156))",
  },
  component2: {
    default: "light-dark(#ff000824, #fe0a3b44)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.008 0.008 / 0.134), color(display-p3 1 0.118 0.267 / 0.236))",
  },
  component3: {
    default: "light-dark(#ff000632, #ff204756)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.918 0.008 0.008 / 0.189), color(display-p3 1 0.212 0.314 / 0.303))",
  },
  border1: {
    default: "light-dark(#f8000442, #ff3e5668)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.831 0.02 0.004 / 0.251), color(display-p3 1 0.318 0.38 / 0.374))",
  },
  border2: {
    default: "light-dark(#df000356, #ff536184)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.741 0.016 0.004 / 0.33), color(display-p3 1 0.4 0.424 / 0.475))",
  },
  border3: {
    default: "light-dark(#d2000571, #ff5d61b0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.698 0.012 0.004 / 0.428), color(display-p3 1 0.431 0.431 / 0.635))",
  },
  solid1: {
    default: "light-dark(#db0007b7, #fe4e54e4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.749 0.008 0 / 0.675), color(display-p3 1 0.388 0.384 / 0.82))",
  },
  solid2: {
    default: "light-dark(#d10005c1, #ff6465eb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.714 0.012 0 / 0.714), color(display-p3 1 0.463 0.447 / 0.853))",
  },
  text1: {
    default: "light-dark(#c40006d3, #ff9592)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.744 0.234 0.222), color(display-p3 1 0.57 0.55))",
  },
  text2: {
    default: "light-dark(#55000de8, #ffd1d9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.36 0.115 0.143), color(display-p3 0.971 0.826 0.852))",
  },
});
