import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import * as stylex from "@stylexjs/stylex";

import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "./theme";
import { WriterApp } from "./writer/writer-app";

const styles = stylex.create({
  root: {
    minHeight: "100vh",
  },
});

/**
 * App shell. Applies Standard Reader's editorial "Almanac" theme (reused from
 * `./theme`) on the root so every design-system component and the writer's
 * inline token references pick up the warm paper + bronze palette, then renders
 * the multi-screen authoring UI.
 */
export function App() {
  return (
    <div
      {...stylex.props(
        editorialUi,
        editorialPrimary,
        editorialFonts,
        editorialShadow,
        ui.bg,
        ui.text,
        styles.root,
      )}
    >
      <WriterApp />
    </div>
  );
}
