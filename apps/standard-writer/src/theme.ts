// Reuse Standard Reader's editorial "Almanac" theme rather than duplicating it.
// These are `stylex.createTheme` override classes that remap the design system's
// default mauve/pink tokens to the warm paper + bronze editorial palette. Applied
// once on the app root (see `App.tsx`), they cascade to every design-system
// component and to the inline token references in `writer/tokens.ts`.
//
// The source file only depends on `@standard-reader/design-system` tokens and
// `@stylexjs/stylex`, so importing it across the app boundary pulls in no
// reader-internal code.
export {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "../../standard-reader/src/components/reader/theme";
