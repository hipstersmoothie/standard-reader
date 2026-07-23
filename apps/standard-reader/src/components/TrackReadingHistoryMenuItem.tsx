import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { MenuItem } from "@standard-reader/design-system/menu";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

const styles = stylex.create({
  currentState: {
    color: uiColor.text1,
  },
});

/** Toggle for whether opens are recorded as `app.standard-reader.read` records. */
export function TrackReadingHistoryMenuItem() {
  const { t } = useLingui();
  const { enabled, setEnabled } = useTrackReadingHistory();

  return (
    <MenuItem
      onPress={() => setEnabled(!enabled)}
      textValue={t`Track reading history`}
      suffix={
        <span {...stylex.props(styles.currentState)}>
          {enabled ? t`On` : t`Off`}
        </span>
      }
    >
      <Trans>Track reading history</Trans>
    </MenuItem>
  );
}
