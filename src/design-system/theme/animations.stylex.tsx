import * as stylex from "@stylexjs/stylex";

const fadeIn = stylex.keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});

const fadeOut = stylex.keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});

const zoomIn = stylex.keyframes({
  from: {
    transform: "scale(0.8)",
  },
  to: {
    transform: "scale(1)",
  },
});

const zoomOut = stylex.keyframes({
  from: {
    transform: "scale(1)",
  },
  to: {
    transform: "scale(0.8)",
  },
});

const slideInRight = stylex.keyframes({
  from: {
    transform: "translateX(100%)",
  },
  to: {
    transform: "translateX(0)",
  },
});

const slideOutRight = stylex.keyframes({
  from: {
    transform: "translateX(0)",
  },
  to: {
    transform: "translateX(100%)",
  },
});

const slideInLeft = stylex.keyframes({
  from: {
    transform: "translateX(-100%)",
  },
  to: {
    transform: "translateX(0)",
  },
});

const slideOutLeft = stylex.keyframes({
  from: {
    transform: "translateX(0)",
  },
  to: {
    transform: "translateX(-100%)",
  },
});

const slideInTop = stylex.keyframes({
  from: {
    transform: "translateY(-100%)",
  },
  to: {
    transform: "translateY(0)",
  },
});

const slideOutTop = stylex.keyframes({
  from: {
    transform: "translateY(0)",
  },
  to: {
    transform: "translateY(-100%)",
  },
});

const slideInBottom = stylex.keyframes({
  from: {
    transform: "translateY(100%)",
  },
  to: {
    transform: "translateY(0)",
  },
});

const slideOutBottom = stylex.keyframes({
  from: {
    transform: "translateY(0)",
  },
  to: {
    transform: "translateY(100%)",
  },
});

export const animations = stylex.defineVars({
  fadeIn,
  fadeOut,
  zoomIn,
  zoomOut,
  slideInRight,
  slideOutRight,
  slideInLeft,
  slideOutLeft,
  slideInTop,
  slideOutTop,
  slideInBottom,
  slideOutBottom,
});

export const animationDuration = stylex.defineConsts({
  fast: "100ms",
  default: "150ms",
  slow: "200ms",
  verySlow: "300ms",
  extremelySlow: "500ms",
});

export const animationTimingFunction = stylex.defineConsts({
  linear: "linear",
  ease: "cubic-bezier(0.25, 0, 0.3, 1)",
  easeIn: "cubic-bezier(0.7, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.3, 1)",
  easeInOut: "cubic-bezier(0.5, 0, 0.5, 1)",
  easeElasticOut: "cubic-bezier(0.5, 1, 0.75, 1.25)",
  easeElasticIn: "cubic-bezier(.5, -0.5, 0.75, 1)",
  easeElasticInOut: "cubic-bezier(0.5, -0.3, 0.1, 1.5)",
  easeSpring: `
    linear(
      0,
      0.007,
      0.029 2.2%,
      0.118 4.7%,
      0.625 14.4%,
      0.826 19%,
      0.902,
      0.962,
      1.008 26.1%,
      1.041 28.7%,
      1.064 32.1%,
      1.07 36%,
      1.061 40.5%,
      1.015 53.4%,
      0.999 61.6%,
      0.995 71.2%,
      1
    )
  `,
});
