import * as stylex from "@stylexjs/stylex";

export const sage = stylex.defineVars({
  bg: {
    default: "light-dark(#fbfdfc, #101211)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.986 0.992 0.988), color(display-p3 0.064 0.07 0.067))",
  },
  bgSubtle: {
    default: "light-dark(#f7f9f8, #171918)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.97 0.977 0.974), color(display-p3 0.092 0.098 0.094))",
  },
  component1: {
    default: "light-dark(#eef1f0, #202221)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.935 0.944 0.94), color(display-p3 0.128 0.135 0.131))",
  },
  component2: {
    default: "light-dark(#e6e9e8, #272a29)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.904 0.913 0.909), color(display-p3 0.155 0.164 0.159))",
  },
  component3: {
    default: "light-dark(#dfe2e0, #2e3130)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.875 0.885 0.88), color(display-p3 0.183 0.193 0.188))",
  },
  border1: {
    default: "light-dark(#d7dad9, #373b39)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.844 0.854 0.849), color(display-p3 0.218 0.23 0.224))",
  },
  border2: {
    default: "light-dark(#cbcfcd, #444947)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.8 0.811 0.806), color(display-p3 0.269 0.285 0.277))",
  },
  border3: {
    default: "light-dark(#b8bcba, #5b625f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.725 0.738 0.732), color(display-p3 0.362 0.382 0.373))",
  },
  solid1: {
    default: "light-dark(#868e8b, #63706b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.531 0.556 0.546), color(display-p3 0.398 0.438 0.421))",
  },
  solid2: {
    default: "light-dark(#7c8481, #717d79)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.492 0.515 0.506), color(display-p3 0.453 0.49 0.474))",
  },
  text1: {
    default: "light-dark(#5f6563, #adb5b2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.377 0.395 0.389), color(display-p3 0.685 0.709 0.697))",
  },
  text2: {
    default: "light-dark(#1a211e, #eceeed)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.107 0.129 0.118), color(display-p3 0.927 0.933 0.93))",
  },
});
export const sageA = stylex.defineVars({
  bg: {
    default: "light-dark(#00804004, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.024 0.514 0.267 / 0.016), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#00402008, #f0f2f108)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.267 0.145 / 0.032), color(display-p3 0.976 0.988 0.984 / 0.03))",
  },
  component1: {
    default: "light-dark(#002d1e11, #f3f5f412)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.184 0.125 / 0.067), color(display-p3 0.992 0.945 0.941 / 0.072))",
  },
  component2: {
    default: "light-dark(#001f1519, #f2fefd1a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.094 0.051 / 0.095), color(display-p3 0.988 0.996 0.992 / 0.102))",
  },
  component3: {
    default: "light-dark(#00180820, #f1fbfa22)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0.098 0.035 / 0.126), color(display-p3 0.992 1 0.996 / 0.131))",
  },
  border1: {
    default: "light-dark(#00140d28, #edfbf42d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.078 0.027 / 0.157), color(display-p3 0.973 1 0.976 / 0.173))",
  },
  border2: {
    default: "light-dark(#00140a34, #edfcf73c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.059 0.039 / 0.2), color(display-p3 0.957 1 0.976 / 0.233))",
  },
  border3: {
    default: "light-dark(#000f0847, #ebfdf657)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.047 0.031 / 0.275), color(display-p3 0.957 1 0.984 / 0.334))",
  },
  solid1: {
    default: "light-dark(#00110b79, #dffdf266)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.059 0.035 / 0.471), color(display-p3 0.902 1 0.957 / 0.397))",
  },
  solid2: {
    default: "light-dark(#00100a83, #e5fdf674)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.047 0.031 / 0.51), color(display-p3 0.929 1 0.973 / 0.452))",
  },
  text1: {
    default: "light-dark(#000a07a0, #f4fefbb0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.031 0.02 / 0.624), color(display-p3 0.969 1 0.988 / 0.688))",
  },
  text2: {
    default: "light-dark(#000805e5, #fdfffeed)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.027 0.012 / 0.895), color(display-p3 0.992 1 0.996 / 0.929))",
  },
});

export const sageInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#101211, #fbfdfc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.064 0.07 0.067), color(display-p3 0.986 0.992 0.988))",
  },
  bgSubtle: {
    default: "light-dark(#171918, #f7f9f8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.092 0.098 0.094), color(display-p3 0.97 0.977 0.974))",
  },
  component1: {
    default: "light-dark(#202221, #eef1f0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.128 0.135 0.131), color(display-p3 0.935 0.944 0.94))",
  },
  component2: {
    default: "light-dark(#272a29, #e6e9e8)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.155 0.164 0.159), color(display-p3 0.904 0.913 0.909))",
  },
  component3: {
    default: "light-dark(#2e3130, #dfe2e0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.183 0.193 0.188), color(display-p3 0.875 0.885 0.88))",
  },
  border1: {
    default: "light-dark(#373b39, #d7dad9)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.218 0.23 0.224), color(display-p3 0.844 0.854 0.849))",
  },
  border2: {
    default: "light-dark(#444947, #cbcfcd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.269 0.285 0.277), color(display-p3 0.8 0.811 0.806))",
  },
  border3: {
    default: "light-dark(#5b625f, #b8bcba)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.362 0.382 0.373), color(display-p3 0.725 0.738 0.732))",
  },
  solid1: {
    default: "light-dark(#63706b, #868e8b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.398 0.438 0.421), color(display-p3 0.531 0.556 0.546))",
  },
  solid2: {
    default: "light-dark(#717d79, #7c8481)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.453 0.49 0.474), color(display-p3 0.492 0.515 0.506))",
  },
  text1: {
    default: "light-dark(#adb5b2, #5f6563)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.685 0.709 0.697), color(display-p3 0.377 0.395 0.389))",
  },
  text2: {
    default: "light-dark(#eceeed, #1a211e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.927 0.933 0.93), color(display-p3 0.107 0.129 0.118))",
  },
});
export const sageInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #00804004)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0.024 0.514 0.267 / 0.016))",
  },
  bgSubtle: {
    default: "light-dark(#f0f2f108, #00402008)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.976 0.988 0.984 / 0.03), color(display-p3 0.02 0.267 0.145 / 0.032))",
  },
  component1: {
    default: "light-dark(#f3f5f412, #002d1e11)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.945 0.941 / 0.072), color(display-p3 0.008 0.184 0.125 / 0.067))",
  },
  component2: {
    default: "light-dark(#f2fefd1a, #001f1519)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.988 0.996 0.992 / 0.102), color(display-p3 0.012 0.094 0.051 / 0.095))",
  },
  component3: {
    default: "light-dark(#f1fbfa22, #00180820)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 1 0.996 / 0.131), color(display-p3 0.008 0.098 0.035 / 0.126))",
  },
  border1: {
    default: "light-dark(#edfbf42d, #00140d28)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.973 1 0.976 / 0.173), color(display-p3 0.004 0.078 0.027 / 0.157))",
  },
  border2: {
    default: "light-dark(#edfcf73c, #00140a34)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.957 1 0.976 / 0.233), color(display-p3 0 0.059 0.039 / 0.2))",
  },
  border3: {
    default: "light-dark(#ebfdf657, #000f0847)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.957 1 0.984 / 0.334), color(display-p3 0.004 0.047 0.031 / 0.275))",
  },
  solid1: {
    default: "light-dark(#dffdf266, #00110b79)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.902 1 0.957 / 0.397), color(display-p3 0.004 0.059 0.035 / 0.471))",
  },
  solid2: {
    default: "light-dark(#e5fdf674, #00100a83)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.929 1 0.973 / 0.452), color(display-p3 0 0.047 0.031 / 0.51))",
  },
  text1: {
    default: "light-dark(#f4fefbb0, #000a07a0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.969 1 0.988 / 0.688), color(display-p3 0 0.031 0.02 / 0.624))",
  },
  text2: {
    default: "light-dark(#fdfffeed, #000805e5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 1 0.996 / 0.929), color(display-p3 0 0.027 0.012 / 0.895))",
  },
});
