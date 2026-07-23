// Side-effect CSS imports (e.g. KaTeX styles in the rich-text editor) resolve
// in every bundler, but consumers that typecheck this source without
// `vite/client` types (such as the browser extension) need the ambient
// declaration to satisfy `noUncheckedSideEffectImports`.
declare module "*.css";
