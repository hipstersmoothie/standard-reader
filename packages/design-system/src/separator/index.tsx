import * as stylex from "@stylexjs/stylex";
import type { SeparatorProps as AriaSeparatorProps } from "react-aria-components";
import { Separator as AriaSeparator } from "react-aria-components";

import { uiColor } from "../theme/color.stylex";
import type { StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  separator: {
    borderWidth: 0,
    backgroundColor: uiColor.component3,
    height: {
      default: "1px",
      ":is([aria-orientation=vertical])": "100%",
    },
    marginBottom: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
    width: {
      default: "100%",
      ":is([aria-orientation=vertical])": "1px",
    },
  },
});

export interface SeparatorProps extends StyleXComponentProps<AriaSeparatorProps> {}

export function Separator({ style, ...props }: SeparatorProps) {
  return (
    <AriaSeparator {...props} {...stylex.props(styles.separator, style)} />
  );
}
