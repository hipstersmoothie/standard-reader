import * as stylex from "@stylexjs/stylex";

export const jade = stylex.defineVars({
  bg: {
    default: "light-dark(#fbfefd, #0d1512)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.986 0.996 0.992), color(display-p3 0.059 0.083 0.071))",
  },
  bgSubtle: {
    default: "light-dark(#f4fbf7, #121c18)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.962 0.983 0.969), color(display-p3 0.078 0.11 0.094))",
  },
  component1: {
    default: "light-dark(#e6f7ed, #0f2e22)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.912 0.965 0.932), color(display-p3 0.091 0.176 0.138))",
  },
  component2: {
    default: "light-dark(#d6f1e3, #0b3b2c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.858 0.941 0.893), color(display-p3 0.102 0.228 0.177))",
  },
  component3: {
    default: "light-dark(#c3e9d7, #114837)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.795 0.909 0.847), color(display-p3 0.133 0.279 0.221))",
  },
  border1: {
    default: "light-dark(#acdec8, #1b5745)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.715 0.864 0.791), color(display-p3 0.174 0.334 0.273))",
  },
  border2: {
    default: "light-dark(#8bceb6, #246854)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.603 0.802 0.718), color(display-p3 0.219 0.402 0.335))",
  },
  border3: {
    default: "light-dark(#56ba9f, #2a7e68)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.44 0.72 0.629), color(display-p3 0.263 0.488 0.411))",
  },
  solid1: {
    default: "light-dark(#29a383, #29a383)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.319 0.63 0.521), color(display-p3 0.319 0.63 0.521))",
  },
  solid2: {
    default: "light-dark(#26997b, #27b08b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.299 0.592 0.488), color(display-p3 0.338 0.68 0.555))",
  },
  text1: {
    default: "light-dark(#208368, #1fd8a4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.15 0.5 0.37), color(display-p3 0.4 0.835 0.656))",
  },
  text2: {
    default: "light-dark(#1d3b31, #adf0d4)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.142 0.229 0.194), color(display-p3 0.734 0.934 0.838))",
  },
});
export const jadeA = stylex.defineVars({
  bg: {
    default: "light-dark(#00c08004, #00de4505)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.757 0.514 / 0.016), color(display-p3 0 0.992 0.298 / 0.017))",
  },
  bgSubtle: {
    default: "light-dark(#00a3460b, #27fba60c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.612 0.22 / 0.04), color(display-p3 0.318 0.988 0.651 / 0.047))",
  },
  component1: {
    default: "light-dark(#00ae4819, #02f99920)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.596 0.235 / 0.087), color(display-p3 0.267 1 0.667 / 0.118))",
  },
  component2: {
    default: "light-dark(#00a85129, #00ffaa2d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.588 0.255 / 0.142), color(display-p3 0.275 0.996 0.702 / 0.173))",
  },
  component3: {
    default: "light-dark(#00a2553c, #11ffb63b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.561 0.251 / 0.204), color(display-p3 0.361 1 0.741 / 0.227))",
  },
  border1: {
    default: "light-dark(#009a5753, #34ffc24b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.525 0.278 / 0.287), color(display-p3 0.439 1 0.796 / 0.286))",
  },
  border2: {
    default: "light-dark(#00945f74, #45fdc75e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.506 0.29 / 0.397), color(display-p3 0.49 1 0.804 / 0.362))",
  },
  border3: {
    default: "light-dark(#00976ea9, #48ffcf75)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.506 0.337 / 0.561), color(display-p3 0.506 1 0.835 / 0.45))",
  },
  solid1: {
    default: "light-dark(#00916bd6, #38feca9d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.459 0.298 / 0.683), color(display-p3 0.478 0.996 0.816 / 0.606))",
  },
  solid2: {
    default: "light-dark(#008764d9, #31fec7ab)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.42 0.271 / 0.702), color(display-p3 0.478 1 0.816 / 0.656))",
  },
  text1: {
    default: "light-dark(#007152df, #21fec0d6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.15 0.5 0.37), color(display-p3 0.4 0.835 0.656))",
  },
  text2: {
    default: "light-dark(#002217e2, #b8ffe1ef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.142 0.229 0.194), color(display-p3 0.734 0.934 0.838))",
  },
});
