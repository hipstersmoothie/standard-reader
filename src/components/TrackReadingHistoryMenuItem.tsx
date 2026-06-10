import * as stylex from "@stylexjs/stylex";
import { MenuItem } from "#/design-system/menu";
import { uiColor } from "#/design-system/theme/color.stylex";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

const styles = stylex.create({
  currentState: {
    color: uiColor.text1,
  },
});

/** Toggle for whether opens are recorded as `app.standard-reader.read` records. */
export function TrackReadingHistoryMenuItem() {
  const { enabled, setEnabled } = useTrackReadingHistory();

  return (
    <MenuItem
      onPress={() => setEnabled(!enabled)}
      suffix={
        <span {...stylex.props(styles.currentState)}>
          {enabled ? "On" : "Off"}
        </span>
      }
    >
      Track reading history
    </MenuItem>
  );
}
