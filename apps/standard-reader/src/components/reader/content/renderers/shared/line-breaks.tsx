import { Fragment } from "react";

/**
 * A run's text with its newlines rendered as real line breaks.
 *
 * Every parser carries a hard break — markdown's trailing backslash, two
 * trailing spaces or `<br>`, a ProseMirror/Mochott `hardBreak`, the joins
 * between a list item's paragraphs — as `\n` inside the run's plaintext, so
 * byte offsets stay aligned with the record's facets. HTML collapses a bare
 * newline into a space, so the break has to be re-materialized at render time
 * or it disappears from the page.
 */
export function withLineBreaks(text: string): React.ReactNode {
  if (!text.includes("\n")) return text;
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}
