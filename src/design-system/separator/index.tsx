import type { SeparatorProps as AriaSeparatorProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Separator as AriaSeparator } from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";

const styles = stylex.create({
  separator: {
    marginBottom: 0,
    marginLeft: 0,
    borderWidth: 0,
    marginRight: 0,
    backgroundColor: uiColor.component3,
    marginTop: 0,
    height: {
      default: "1px",
      ":is([aria-orientation=vertical])": "100%",
    },
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
