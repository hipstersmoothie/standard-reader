import eslintPluginStylex from "@stylexjs/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** One-shot autofix for StyleX rules that support --fix (used by oxlint). */
export default [
  {
    ignores: [
      "**/routeTree.gen.ts",
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "packages/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}", "extension/src/**/*.{ts,tsx}"],
    plugins: {
      "@stylexjs": eslintPluginStylex,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "@stylexjs/sort-keys": ["error", { allowLineSeparatedGroups: true }],
      "@stylexjs/valid-shorthands": "error",
    },
  },
];
