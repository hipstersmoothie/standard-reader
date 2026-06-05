import * as stylex from "@stylexjs/stylex";

export const orange = stylex.defineVars({
  bg: {
    default: "light-dark(#fefcfb, #17120e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.988 0.985), color(display-p3 0.088 0.07 0.057))",
  },
  bgSubtle: {
    default: "light-dark(#fff7ed, #1e160f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.994 0.968 0.934), color(display-p3 0.113 0.089 0.061))",
  },
  component1: {
    default: "light-dark(#ffefd6, #331e0b)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.989 0.938 0.85), color(display-p3 0.189 0.12 0.056))",
  },
  component2: {
    default: "light-dark(#ffdfb5, #462100)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.874 0.687), color(display-p3 0.262 0.132 0))",
  },
  component3: {
    default: "light-dark(#ffd19a, #562800)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.821 0.583), color(display-p3 0.315 0.168 0.016))",
  },
  border1: {
    default: "light-dark(#ffc182, #66350c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.975 0.767 0.545), color(display-p3 0.376 0.219 0.088))",
  },
  border2: {
    default: "light-dark(#f5ae73, #7e451d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.919 0.693 0.486), color(display-p3 0.465 0.283 0.147))",
  },
  border3: {
    default: "light-dark(#ec9455, #a35829)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.877 0.597 0.379), color(display-p3 0.601 0.359 0.201))",
  },
  solid1: {
    default: "light-dark(#f76b15, #f76b15)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.9 0.45 0.2), color(display-p3 0.9 0.45 0.2))",
  },
  solid2: {
    default: "light-dark(#ef5f00, #ff801f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.87 0.409 0.164), color(display-p3 0.98 0.51 0.23))",
  },
  text1: {
    default: "light-dark(#cc4e00, #ffa057)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.76 0.34 0), color(display-p3 1 0.63 0.38))",
  },
  text2: {
    default: "light-dark(#582d1d, #ffe0c2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.323 0.185 0.127), color(display-p3 0.98 0.883 0.775))",
  },
});
export const orangeA = stylex.defineVars({
  bg: {
    default: "light-dark(#c0400004, #ec360007)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.757 0.267 0.024 / 0.016), color(display-p3 0.961 0.247 0 / 0.022))",
  },
  bgSubtle: {
    default: "light-dark(#ff8e0012, #fe6d000e)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.886 0.533 0.008 / 0.067), color(display-p3 0.992 0.529 0 / 0.051))",
  },
  component1: {
    default: "light-dark(#ff9c0029, #fb6a0025)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.922 0.584 0.008 / 0.15), color(display-p3 0.996 0.486 0 / 0.131))",
  },
  component2: {
    default: "light-dark(#ff91014a, #ff590039)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.604 0.004 / 0.314), color(display-p3 0.996 0.384 0 / 0.211))",
  },
  component3: {
    default: "light-dark(#ff8b0065, #ff61004a)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 1 0.569 0.004 / 0.416), color(display-p3 1 0.455 0 / 0.265))",
  },
  border1: {
    default: "light-dark(#ff81007d, #fd75045c)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.949 0.494 0.004 / 0.455), color(display-p3 1 0.529 0.129 / 0.332))",
  },
  border2: {
    default: "light-dark(#ed6c008c, #ff832c75)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.839 0.408 0 / 0.514), color(display-p3 1 0.569 0.251 / 0.429))",
  },
  border3: {
    default: "light-dark(#e35f00aa, #fe84389d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.804 0.349 0 / 0.62), color(display-p3 1 0.584 0.302 / 0.572))",
  },
  solid1: {
    default: "light-dark(#f65e00ea, #fe6d15f7)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.878 0.314 0 / 0.8), color(display-p3 1 0.494 0.216 / 0.895))",
  },
  solid2: {
    default: "light-dark(#ef5f00, #ff801f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.843 0.29 0 / 0.836), color(display-p3 1 0.522 0.235 / 0.979))",
  },
  text1: {
    default: "light-dark(#cc4e00, #ffa057)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.76 0.34 0), color(display-p3 1 0.63 0.38))",
  },
  text2: {
    default: "light-dark(#431200e2, #ffe0c2)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.323 0.185 0.127), color(display-p3 0.98 0.883 0.775))",
  },
});
