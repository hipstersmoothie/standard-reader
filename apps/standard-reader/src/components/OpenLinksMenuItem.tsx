import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { MenuItem } from "@standard-reader/design-system/menu";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { useOpenLinks } from "#/lib/use-open-links";

const styles = stylex.create({
  currentState: {
    color: uiColor.text1,
  },
});

/**
 * Toggle for the "open on original site" preference: when on, document links
 * open on the external website where they're published instead of the in-app
 * reader.
 */
export function OpenLinksMenuItem() {
  const { t } = useLingui();
  const { openExternally, setOpenExternally } = useOpenLinks();

  return (
    <MenuItem
      onPress={() => setOpenExternally(!openExternally)}
      textValue={t`Open posts externally`}
      suffix={
        <span {...stylex.props(styles.currentState)}>
          {openExternally ? <Trans>On</Trans> : <Trans>Off</Trans>}
        </span>
      }
    >
      <Trans>Open posts externally</Trans>
    </MenuItem>
  );
}
