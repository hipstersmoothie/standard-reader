import * as stylex from "@stylexjs/stylex";

export const cyan = stylex.defineVars({
  bg: {
    default: "light-dark(#fafdfe, #0b161a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.982 0.992 0.996), color(display-p3 0.053 0.085 0.098))",
  },
  bgSubtle: {
    default: "light-dark(#f2fafb, #101b20)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.955 0.981 0.984), color(display-p3 0.072 0.105 0.122))",
  },
  component1: {
    default: "light-dark(#def7f9, #082c36)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.888 0.965 0.975), color(display-p3 0.073 0.168 0.209))",
  },
  component2: {
    default: "light-dark(#caf1f6, #003848)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.821 0.941 0.959), color(display-p3 0.063 0.216 0.277))",
  },
  component3: {
    default: "light-dark(#b5e9f0, #004558)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.751 0.907 0.935), color(display-p3 0.091 0.267 0.336))",
  },
  border1: {
    default: "light-dark(#9ddde7, #045468)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.671 0.862 0.9), color(display-p3 0.137 0.324 0.4))",
  },
  border2: {
    default: "light-dark(#7dcedc, #12677e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.564 0.8 0.854), color(display-p3 0.186 0.398 0.484))",
  },
  border3: {
    default: "light-dark(#3db9cf, #11809c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.388 0.715 0.798), color(display-p3 0.23 0.496 0.6))",
  },
  solid1: {
    default: "light-dark(#00a2c7, #00a2c7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.282 0.627 0.765), color(display-p3 0.282 0.627 0.765))",
  },
  solid2: {
    default: "light-dark(#0797b9, #23afd0)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.264 0.583 0.71), color(display-p3 0.331 0.675 0.801))",
  },
  text1: {
    default: "light-dark(#107d98, #4ccce6)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.08 0.48 0.63), color(display-p3 0.446 0.79 0.887))",
  },
  text2: {
    default: "light-dark(#0d3c48, #b6ecf7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.108 0.232 0.277), color(display-p3 0.757 0.919 0.962))",
  },
});
export const cyanA = stylex.defineVars({
  bg: {
    default: "light-dark(#0099cc05, #0091f70a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.608 0.804 / 0.02), color(display-p3 0 0.647 0.992 / 0.034))",
  },
  bgSubtle: {
    default: "light-dark(#009db10d, #02a7f211)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.02 0.557 0.647 / 0.044), color(display-p3 0.133 0.733 1 / 0.059))",
  },
  component1: {
    default: "light-dark(#00c2d121, #00befd28)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.694 0.796 / 0.114), color(display-p3 0.122 0.741 0.996 / 0.152))",
  },
  component2: {
    default: "light-dark(#00bcd435, #00baff3b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.678 0.784 / 0.181), color(display-p3 0.051 0.725 1 / 0.227))",
  },
  component3: {
    default: "light-dark(#01b4cc4a, #00befd4d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.624 0.733 / 0.248), color(display-p3 0.149 0.757 1 / 0.29))",
  },
  border1: {
    default: "light-dark(#00a7c162, #00c7fd5e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.584 0.706 / 0.33), color(display-p3 0.267 0.792 1 / 0.358))",
  },
  border2: {
    default: "light-dark(#009fbb82, #14cdff75)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.004 0.541 0.667 / 0.436), color(display-p3 0.333 0.808 1 / 0.446))",
  },
  border3: {
    default: "light-dark(#00a3c0c2, #11cfff95)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.533 0.667 / 0.612), color(display-p3 0.357 0.816 1 / 0.572))",
  },
  solid1: {
    default: "light-dark(#00a2c7, #00cfffc3)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.482 0.675 / 0.718), color(display-p3 0.357 0.82 1 / 0.748))",
  },
  solid2: {
    default: "light-dark(#0094b7f8, #28d6ffcd)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0 0.435 0.608 / 0.738), color(display-p3 0.4 0.839 1 / 0.786))",
  },
  text1: {
    default: "light-dark(#007491ef, #52e1fee5)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.08 0.48 0.63), color(display-p3 0.446 0.79 0.887))",
  },
  text2: {
    default: "light-dark(#00323ef2, #bbf3fef7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.108 0.232 0.277), color(display-p3 0.757 0.919 0.962))",
  },
});
