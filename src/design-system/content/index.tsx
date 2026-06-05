import * as stylex from "@stylexjs/stylex";

import type { StyleXComponentProps } from "../theme/types";

import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { lineHeight } from "../theme/typography.stylex";

const styles = stylex.create({
  root: {
    /* eslint-disable @stylexjs/valid-styles, @stylexjs/no-legacy-contextual-styles */

    ":is(*) > :is(:has(h1),h1)": {
      marginBottom: verticalSpace["7xl"],
      marginTop: verticalSpace["7xl"],
    },
    ":is(*) > :is(:has(h2),h2)": {
      marginBottom: verticalSpace["3xl"],
      marginTop: verticalSpace["7xl"],
    },
    ":is(*) > :is(:has(h3),h3)": {
      marginBottom: verticalSpace["4xl"],
      marginTop: verticalSpace["7xl"],
    },
    ":is(*) > :is(:has(h4),h4)": {
      marginBottom: verticalSpace["7xl"],
      marginTop: verticalSpace["7xl"],
    },
    ":is(*) > :is(:has(h5),h5)": {
      marginBottom: verticalSpace["7xl"],
      marginTop: verticalSpace["7xl"],
    },
    ":is(*) > blockquote": {
      marginBottom: 0,
      marginLeft: horizontalSpace["md"],
      marginRight: 0,
      marginTop: 0,
      paddingLeft: horizontalSpace["3xl"],
    },
    ":is(*) > p": {
      lineHeight: {
        default: lineHeight.xl,
        ":is(blockquote *)": lineHeight.base,
        ":is(li *)": lineHeight.base,
      },
      marginBottom: {
        default: verticalSpace["3xl"],
        ":is(blockquote *)": verticalSpace["none"],
        ":is(li *)": verticalSpace["none"],
      },
      marginTop: {
        default: verticalSpace["3xl"],
        ":is(blockquote *)": verticalSpace["none"],
        ":is(li *)": verticalSpace["none"],
      },
    },

    /* eslint-enable @stylexjs/valid-styles, @stylexjs/no-legacy-contextual-styles */
  },
});

export interface ContentProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

/**
 * A wrapper component that applies content spacing styles to child elements.
 *
 * @example
 * ```tsx
 * <Content>
 *   <h1>Title</h1>
 *   <p>Paragraph text</p>
 * </Content>
 * ```
 */
export const Content = ({ style, ...props }: ContentProps) => {
  return <div {...props} {...stylex.props(styles.root, style)} />;
};
