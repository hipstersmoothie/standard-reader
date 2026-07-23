import * as stylex from "@stylexjs/stylex";

export const mauve = stylex.defineVars({
  bg: {
    default: "light-dark(#fdfcfd, #121113)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.991 0.988 0.992), color(display-p3 0.07 0.067 0.074))",
  },
  bgSubtle: {
    default: "light-dark(#faf9fb, #1a191b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.98 0.976 0.984), color(display-p3 0.101 0.098 0.105))",
  },
  component1: {
    default: "light-dark(#f2eff3, #232225)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.946 0.938 0.952), color(display-p3 0.138 0.134 0.144))",
  },
  component2: {
    default: "light-dark(#eae7ec, #2b292d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.915 0.906 0.925), color(display-p3 0.167 0.161 0.175))",
  },
  component3: {
    default: "light-dark(#e3dfe6, #323035)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.886 0.876 0.901), color(display-p3 0.196 0.189 0.206))",
  },
  border1: {
    default: "light-dark(#dbd8e0, #3c393f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.856 0.846 0.875), color(display-p3 0.232 0.225 0.245))",
  },
  border2: {
    default: "light-dark(#d0cdd7, #49474e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.814 0.804 0.84), color(display-p3 0.286 0.277 0.302))",
  },
  border3: {
    default: "light-dark(#bcbac7, #625f69)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.735 0.728 0.777), color(display-p3 0.383 0.373 0.408))",
  },
  solid1: {
    default: "light-dark(#8e8c99, #6f6d78)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.555 0.549 0.596), color(display-p3 0.434 0.428 0.467))",
  },
  solid2: {
    default: "light-dark(#84828e, #7c7a85)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.514 0.508 0.552), color(display-p3 0.487 0.48 0.519))",
  },
  text1: {
    default: "light-dark(#65636d, #b5b2bc)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.395 0.388 0.424), color(display-p3 0.707 0.7 0.735))",
  },
  text2: {
    default: "light-dark(#211f26, #eeeef0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.128 0.122 0.147), color(display-p3 0.933 0.933 0.94))",
  },
});
export const mauveA = stylex.defineVars({
  bg: {
    default: "light-dark(#55005503, #00000000)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.349 0.024 0.349 / 0.012), color(display-p3 0 0 0 / 0))",
  },
  bgSubtle: {
    default: "light-dark(#2b005506, #f5f4f609)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.184 0.024 0.349 / 0.024), color(display-p3 0.996 0.992 1 / 0.034))",
  },
  component1: {
    default: "light-dark(#30004010, #ebeaf814)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.129 0.008 0.255 / 0.063), color(display-p3 0.937 0.933 0.992 / 0.077))",
  },
  component2: {
    default: "light-dark(#20003618, #eee5f81d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.094 0.012 0.216 / 0.095), color(display-p3 0.957 0.918 0.996 / 0.111))",
  },
  component3: {
    default: "light-dark(#20003820, #efe6fe25)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.098 0.008 0.224 / 0.126), color(display-p3 0.937 0.906 0.996 / 0.145))",
  },
  border1: {
    default: "light-dark(#14003527, #f1e6fd30)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.055 0.004 0.18 / 0.153), color(display-p3 0.953 0.925 0.996 / 0.183))",
  },
  border2: {
    default: "light-dark(#10003332, #eee9ff40)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.067 0.008 0.184 / 0.197), color(display-p3 0.945 0.929 1 / 0.246))",
  },
  border3: {
    default: "light-dark(#08003145, #eee7ff5d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.004 0.176 / 0.271), color(display-p3 0.937 0.918 1 / 0.361))",
  },
  solid1: {
    default: "light-dark(#05001d73, #eae6fd6e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.004 0.106 / 0.451), color(display-p3 0.933 0.918 1 / 0.424))",
  },
  solid2: {
    default: "light-dark(#0500197d, #ece9fd7c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.012 0.004 0.09 / 0.491), color(display-p3 0.941 0.925 1 / 0.479))",
  },
  text1: {
    default: "light-dark(#0400119c, #f5f1ffb7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.016 0 0.059 / 0.612), color(display-p3 0.965 0.961 1 / 0.712))",
  },
  text2: {
    default: "light-dark(#020008e0, #fdfdffef)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.008 0 0.027 / 0.879), color(display-p3 0.992 0.992 1 / 0.937))",
  },
});

export const mauveInverted = stylex.defineVars({
  bg: {
    default: "light-dark(#121113, #fdfcfd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.07 0.067 0.074), color(display-p3 0.991 0.988 0.992))",
  },
  bgSubtle: {
    default: "light-dark(#1a191b, #faf9fb)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.101 0.098 0.105), color(display-p3 0.98 0.976 0.984))",
  },
  component1: {
    default: "light-dark(#232225, #f2eff3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.138 0.134 0.144), color(display-p3 0.946 0.938 0.952))",
  },
  component2: {
    default: "light-dark(#2b292d, #eae7ec)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.167 0.161 0.175), color(display-p3 0.915 0.906 0.925))",
  },
  component3: {
    default: "light-dark(#323035, #e3dfe6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.196 0.189 0.206), color(display-p3 0.886 0.876 0.901))",
  },
  border1: {
    default: "light-dark(#3c393f, #dbd8e0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.232 0.225 0.245), color(display-p3 0.856 0.846 0.875))",
  },
  border2: {
    default: "light-dark(#49474e, #d0cdd7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.286 0.277 0.302), color(display-p3 0.814 0.804 0.84))",
  },
  border3: {
    default: "light-dark(#625f69, #bcbac7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.383 0.373 0.408), color(display-p3 0.735 0.728 0.777))",
  },
  solid1: {
    default: "light-dark(#6f6d78, #8e8c99)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.434 0.428 0.467), color(display-p3 0.555 0.549 0.596))",
  },
  solid2: {
    default: "light-dark(#7c7a85, #84828e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.487 0.48 0.519), color(display-p3 0.514 0.508 0.552))",
  },
  text1: {
    default: "light-dark(#b5b2bc, #65636d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.707 0.7 0.735), color(display-p3 0.395 0.388 0.424))",
  },
  text2: {
    default: "light-dark(#eeeef0, #211f26)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.933 0.94), color(display-p3 0.128 0.122 0.147))",
  },
});
export const mauveInvertedA = stylex.defineVars({
  bg: {
    default: "light-dark(#00000000, #55005503)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0 0 / 0), color(display-p3 0.349 0.024 0.349 / 0.012))",
  },
  bgSubtle: {
    default: "light-dark(#f5f4f609, #2b005506)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.996 0.992 1 / 0.034), color(display-p3 0.184 0.024 0.349 / 0.024))",
  },
  component1: {
    default: "light-dark(#ebeaf814, #30004010)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.937 0.933 0.992 / 0.077), color(display-p3 0.129 0.008 0.255 / 0.063))",
  },
  component2: {
    default: "light-dark(#eee5f81d, #20003618)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.957 0.918 0.996 / 0.111), color(display-p3 0.094 0.012 0.216 / 0.095))",
  },
  component3: {
    default: "light-dark(#efe6fe25, #20003820)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.937 0.906 0.996 / 0.145), color(display-p3 0.098 0.008 0.224 / 0.126))",
  },
  border1: {
    default: "light-dark(#f1e6fd30, #14003527)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.953 0.925 0.996 / 0.183), color(display-p3 0.055 0.004 0.18 / 0.153))",
  },
  border2: {
    default: "light-dark(#eee9ff40, #10003332)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.945 0.929 1 / 0.246), color(display-p3 0.067 0.008 0.184 / 0.197))",
  },
  border3: {
    default: "light-dark(#eee7ff5d, #08003145)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.937 0.918 1 / 0.361), color(display-p3 0.02 0.004 0.176 / 0.271))",
  },
  solid1: {
    default: "light-dark(#eae6fd6e, #05001d73)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.933 0.918 1 / 0.424), color(display-p3 0.02 0.004 0.106 / 0.451))",
  },
  solid2: {
    default: "light-dark(#ece9fd7c, #0500197d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.941 0.925 1 / 0.479), color(display-p3 0.012 0.004 0.09 / 0.491))",
  },
  text1: {
    default: "light-dark(#f5f1ffb7, #0400119c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.965 0.961 1 / 0.712), color(display-p3 0.016 0 0.059 / 0.612))",
  },
  text2: {
    default: "light-dark(#fdfdffef, #020008e0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.992 0.992 1 / 0.937), color(display-p3 0.008 0 0.027 / 0.879))",
  },
});
