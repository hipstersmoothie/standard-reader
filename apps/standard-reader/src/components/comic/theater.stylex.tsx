import * as stylex from "@stylexjs/stylex";

/**
 * The comic theater's palette.
 *
 * One fixed look in both colour schemes: art is the whole point, and a page of
 * comic reads against near-black whatever the rest of the app is doing. Same
 * reasoning (and the same shape of value) as the design system's lightbox, the
 * other surface that exists to show one image.
 *
 * Tokens rather than exported string constants because the theater is no longer
 * one component — the note overlay lays its own surface over the same art and
 * has to read as part of the same room — and because StyleX only accepts a raw
 * colour where it can see the literal. An imported constant it cannot follow is
 * a lint error; a token is the shape the linter (and the design system) expects
 * a shared colour to take.
 */
export const theaterColor = stylex.defineVars({
  backdrop: "light-dark(rgb(9, 8, 10), rgb(4, 4, 6))",
  chrome: "rgba(255, 255, 255, 0.62)",
  chromeStrong: "rgba(255, 255, 255, 0.92)",
  rule: "rgba(255, 255, 255, 0.14)",
  surface: "rgba(255, 255, 255, 0.08)",
  /**
   * The note's scrim. The page it belongs to should still be there behind the
   * words — that is the whole reason it isn't simply the reading view — but a
   * paragraph has to stay readable over a bright panel, so it is dark enough to
   * carry type and no darker.
   */
  noteScrim: "rgba(6, 5, 8, 0.86)",
});
