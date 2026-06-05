import * as stylex from "@stylexjs/stylex";

export const yellow = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfdf9, #14120b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 0.978), color(display-p3 0.078 0.069 0.047))",
  },
  bgSubtle: {
    default: "light-dark(#fefce9, #1b180f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.99 0.922), color(display-p3 0.103 0.094 0.063))",
  },
  component1: {
    default: "light-dark(#fffab8, #2d2305)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.997 0.982 0.749), color(display-p3 0.168 0.137 0.039))",
  },
  component2: {
    default: "light-dark(#fff394, #362b00)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.953 0.627), color(display-p3 0.209 0.169 0))",
  },
  component3: {
    default: "light-dark(#ffe770, #433500)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.984 0.91 0.51), color(display-p3 0.255 0.209 0))",
  },
  border1: {
    default: "light-dark(#f3d768, #524202)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.934 0.847 0.474), color(display-p3 0.31 0.261 0.07))",
  },
  border2: {
    default: "light-dark(#e4c767, #665417)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.876 0.785 0.46), color(display-p3 0.389 0.331 0.135))",
  },
  border3: {
    default: "light-dark(#d5ae39, #836a21)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.811 0.689 0.313), color(display-p3 0.497 0.42 0.182))",
  },
  solid1: {
    default: "light-dark(#ffe629, #ffe629)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.92 0.22), color(display-p3 1 0.92 0.22))",
  },
  solid2: {
    default: "light-dark(#ffdc00, #ffff57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.977 0.868 0.291), color(display-p3 1 1 0.456))",
  },
  text1: {
    default: "light-dark(#9e6c00, #f5e147)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.6 0.44 0), color(display-p3 0.948 0.885 0.392))",
  },
  text2: {
    default: "light-dark(#473b1f, #f6eeb4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.271 0.233 0.137), color(display-p3 0.959 0.934 0.731))",
  },
});
export const yellowA = stylex.defineVars({
  bg: {
    default: "light-dark(#aaaa0006, #d1510004)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.675 0.675 0.024 / 0.024), color(display-p3 0.973 0.369 0 / 0.013))",
  },
  bgSubtle: {
    default: "light-dark(#f4dd0016, #f9b4000b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.855 0.008 / 0.079), color(display-p3 0.996 0.792 0 / 0.038))",
  },
  component1: {
    default: "light-dark(#ffee0047, #ffaa001e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.925 0.004 / 0.251), color(display-p3 0.996 0.71 0 / 0.11))",
  },
  component2: {
    default: "light-dark(#ffe3016b, #fdb70028)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 0.875 0.004 / 0.373), color(display-p3 0.996 0.741 0 / 0.152))",
  },
  component3: {
    default: "light-dark(#ffd5008f, #febb0036)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.969 0.816 0.004 / 0.491), color(display-p3 0.996 0.765 0 / 0.202))",
  },
  border1: {
    default: "light-dark(#ebbc0097, #fec40046)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.875 0.71 0 / 0.526), color(display-p3 0.996 0.816 0.082 / 0.261))",
  },
  border2: {
    default: "light-dark(#d2a10098, #fdcb225c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.769 0.604 0 / 0.542), color(display-p3 1 0.831 0.263 / 0.345))",
  },
  border3: {
    default: "light-dark(#c99700c6, #fdca327b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.725 0.549 0 / 0.687), color(display-p3 1 0.831 0.314 / 0.463))",
  },
  solid1: {
    default: "light-dark(#ffe100d6, #ffe629)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.898 0 / 0.781), color(display-p3 1 0.922 0.22))",
  },
  solid2: {
    default: "light-dark(#ffdc00, #ffff57)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.969 0.812 0 / 0.71), color(display-p3 1 1 0.455))",
  },
  text1: {
    default: "light-dark(#9e6c00, #fee949f5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.6 0.44 0), color(display-p3 0.948 0.885 0.392))",
  },
  text2: {
    default: "light-dark(#2e2000e0, #fef6baf6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.271 0.233 0.137), color(display-p3 0.959 0.934 0.731))",
  },
});
