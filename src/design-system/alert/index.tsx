"use client";

import * as stylex from "@stylexjs/stylex";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { use } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { IconButton } from "../icon-button";
import {
  criticalColor,
  primaryColor,
  successColor,
  uiColor,
  warningColor,
} from "../theme/color.stylex";
import { maxBreakpoints } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  critical,
  primary,
  success,
  warning,
} from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily } from "../theme/typography.stylex";
import { Text } from "../typography/text";

const styles = stylex.create({
  alert: {
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    gap: gap["lg"],
    gridTemplateAreas: {
      default: "'icon content'",
      [maxBreakpoints.sm]: "'icon content'",
    },
    alignItems: "center",
    boxSizing: "border-box",
    display: "grid",
    fontFamily: fontFamily["sans"],
    gridTemplateColumns: {
      default: "auto 1fr",
      [maxBreakpoints.sm]: "auto 1fr",
    },
    position: "relative",
    minHeight: sizeSpace["4xl"],
    paddingBottom: verticalSpace["lg"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["lg"],
  },
  alertWithDescription: {
    alignItems: "flex-start",
    paddingBottom: verticalSpace["3xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: verticalSpace["3xl"],
  },
  alertWithClose: {
    gridTemplateAreas: {
      default: "'icon content close'",
      [maxBreakpoints.sm]: "'icon content close'",
    },
    gridTemplateColumns: {
      default: "auto 1fr auto",
      [maxBreakpoints.sm]: "auto 1fr auto",
    },
    paddingRight: horizontalSpace["md"],
  },
  alertWithAction: {
    gridTemplateAreas: {
      default: "'icon content action'",
      [maxBreakpoints.sm]: "'icon content' 'action action action'",
    },
    gridTemplateColumns: {
      default: "auto 1fr auto",
      [maxBreakpoints.sm]: "auto 1fr",
    },
    paddingRight: horizontalSpace["md"],
  },
  alertWithActionAndClose: {
    gridTemplateAreas: {
      default: "'icon content action close'",
      [maxBreakpoints.sm]: "'icon content close' 'action action action'",
    },
    gridTemplateColumns: {
      default: "auto 1fr auto auto",
      [maxBreakpoints.sm]: "auto 1fr auto",
    },
    paddingRight: horizontalSpace["md"],
  },
  content: {
    gridColumnEnd: 'content',
    gridColumnStart: 'content',
    gridRowEnd: 'content',
    gridRowStart: 'content',
    gap: gap["xl"],
    display: "flex",
    flexDirection: "column",
  },
  contentWithDescription: {
    paddingTop: verticalSpace["xxs"],
  },
  icon: {
    gridColumnEnd: 'icon',
    gridColumnStart: 'icon',
    gridRowEnd: 'icon',
    gridRowStart: 'icon',
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    pointerEvents: "none",

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["lg"],
      width: sizeSpace["lg"],
    },
  },
  action: {
    gridColumnEnd: 'action',
    gridColumnStart: 'action',
    gridRowEnd: 'action',
    gridRowStart: 'action',
    gap: gap["md"],
    alignItems: "center",
    alignSelf: "center",
    display: "flex",
    flexShrink: 0,
  },
  closeButton: {
    gridColumnEnd: 'close',
    gridColumnStart: 'close',
    gridRowEnd: 'close',
    gridRowStart: 'close',
    flexShrink: 0,
    marginBottom: `calc(${verticalSpace["xxs"]} * -1)`,
    marginTop: `calc(${verticalSpace["xxs"]} * -1)`,
  },
  actionAndClose: {
    alignSelf: "center",
  },
  info: {
    [uiColor.bg]: primaryColor.bg,
    [uiColor.bgSubtle]: primaryColor.bgSubtle,
    [uiColor.component1]: primaryColor.component1,
    [uiColor.component2]: primaryColor.component2,
    [uiColor.component3]: primaryColor.component3,
    [uiColor.border1]: primaryColor.border1,
    [uiColor.border2]: primaryColor.border2,
    [uiColor.border3]: primaryColor.border3,
    [uiColor.solid1]: primaryColor.solid1,
    [uiColor.solid2]: primaryColor.solid2,
    [uiColor.text1]: primaryColor.text1,
    [uiColor.text2]: primaryColor.text2,
    [uiColor.textContrast]: primaryColor.textContrast,
  },
  success: {
    [uiColor.bg]: successColor.bg,
    [uiColor.bgSubtle]: successColor.bgSubtle,
    [uiColor.component1]: successColor.component1,
    [uiColor.component2]: successColor.component2,
    [uiColor.component3]: successColor.component3,
    [uiColor.border1]: successColor.border1,
    [uiColor.border2]: successColor.border2,
    [uiColor.border3]: successColor.border3,
    [uiColor.solid1]: successColor.solid1,
    [uiColor.solid2]: successColor.solid2,
    [uiColor.text1]: successColor.text1,
    [uiColor.text2]: successColor.text2,
    [uiColor.textContrast]: successColor.textContrast,

    [primaryColor.bg]: successColor.bg,
    [primaryColor.bgSubtle]: successColor.bgSubtle,
    [primaryColor.component1]: successColor.component1,
    [primaryColor.component2]: successColor.component2,
    [primaryColor.component3]: successColor.component3,
    [primaryColor.border1]: successColor.border1,
    [primaryColor.border2]: successColor.border2,
    [primaryColor.border3]: successColor.border3,
    [primaryColor.solid1]: successColor.solid1,
    [primaryColor.solid2]: successColor.solid2,
    [primaryColor.text1]: successColor.text1,
    [primaryColor.text2]: successColor.text2,
    [primaryColor.textContrast]: successColor.textContrast,
  },
  warning: {
    [uiColor.bg]: warningColor.bg,
    [uiColor.bgSubtle]: warningColor.bgSubtle,
    [uiColor.component1]: warningColor.component1,
    [uiColor.component2]: warningColor.component2,
    [uiColor.component3]: warningColor.component3,
    [uiColor.border1]: warningColor.border1,
    [uiColor.border2]: warningColor.border2,
    [uiColor.border3]: warningColor.border3,
    [uiColor.solid1]: warningColor.solid1,
    [uiColor.solid2]: warningColor.solid2,
    [uiColor.text1]: warningColor.text1,
    [uiColor.text2]: warningColor.text2,
    [uiColor.textContrast]: warningColor.textContrast,

    [primaryColor.bg]: warningColor.bg,
    [primaryColor.bgSubtle]: warningColor.bgSubtle,
    [primaryColor.component1]: warningColor.component1,
    [primaryColor.component2]: warningColor.component2,
    [primaryColor.component3]: warningColor.component3,
    [primaryColor.border1]: warningColor.border1,
    [primaryColor.border2]: warningColor.border2,
    [primaryColor.border3]: warningColor.border3,
    [primaryColor.solid1]: warningColor.solid1,
    [primaryColor.solid2]: warningColor.solid2,
    [primaryColor.text1]: warningColor.text1,
    [primaryColor.text2]: warningColor.text2,
    [primaryColor.textContrast]: warningColor.textContrast,
  },
  critical: {
    [uiColor.bg]: criticalColor.bg,
    [uiColor.bgSubtle]: criticalColor.bgSubtle,
    [uiColor.component1]: criticalColor.component1,
    [uiColor.component2]: criticalColor.component2,
    [uiColor.component3]: criticalColor.component3,
    [uiColor.border1]: criticalColor.border1,
    [uiColor.border2]: criticalColor.border2,
    [uiColor.border3]: criticalColor.border3,
    [uiColor.solid1]: criticalColor.solid1,
    [uiColor.solid2]: criticalColor.solid2,
    [uiColor.text1]: criticalColor.text1,
    [uiColor.text2]: criticalColor.text2,
    [uiColor.textContrast]: criticalColor.textContrast,

    [primaryColor.bg]: criticalColor.bg,
    [primaryColor.bgSubtle]: criticalColor.bgSubtle,
    [primaryColor.component1]: criticalColor.component1,
    [primaryColor.component2]: criticalColor.component2,
    [primaryColor.component3]: criticalColor.component3,
    [primaryColor.border1]: criticalColor.border1,
    [primaryColor.border2]: criticalColor.border2,
    [primaryColor.border3]: criticalColor.border3,
    [primaryColor.solid1]: criticalColor.solid1,
    [primaryColor.solid2]: criticalColor.solid2,
    [primaryColor.text1]: criticalColor.text1,
    [primaryColor.text2]: criticalColor.text2,
    [primaryColor.textContrast]: criticalColor.textContrast,
  },
});

export type AlertVariant = "info" | "success" | "warning" | "critical";

export interface AlertProps extends Omit<
  StyleXComponentProps<React.ComponentProps<"div">>,
  "title"
> {
  /**
   * The variant of the alert.
   * @default "info"
   */
  variant?: AlertVariant;
  /**
   * The size of the alert.
   */
  size?: Size;
  /**
   * The title of the alert.
   */
  title?: React.ReactNode;
  /**
   * The description or content of the alert.
   */
  children?: React.ReactNode;
  /**
   * Action elements to display in the alert (e.g., buttons).
   */
  action?: React.ReactNode;
  /**
   * Callback fired when the alert is dismissed. If provided, a close button will be displayed.
   */
  onDismiss?: () => void;
  /**
   * Custom icon to display. If not provided, a default icon will be used based on the variant.
   */
  icon?: React.ReactNode;
}

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  info: <Info />,
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  critical: <AlertCircle />,
};

export const Alert = ({
  variant = "info",
  size: sizeProp,
  title,
  children,
  action,
  onDismiss,
  icon,
  style,
  ...props
}: AlertProps) => {
  const size = sizeProp ?? use(SizeContext);

  const defaultIcon = defaultIcons[variant];
  const displayIcon = icon === undefined ? defaultIcon : icon;
  const hasAction = action != null;
  const hasCloseButton = onDismiss != null;
  const actionStyles = [
    variant === "info" && styles.info,
    variant === "success" && styles.success,
    variant === "warning" && styles.warning,
    variant === "critical" && styles.critical,
  ];

  return (
    <div
      role="alert"
      data-variant={variant}
      data-size={size}
      {...stylex.props(
        styles.alert,
        !hasAction && hasCloseButton && styles.alertWithClose,
        hasAction && hasCloseButton && styles.alertWithActionAndClose,
        hasAction && !hasCloseButton && styles.alertWithAction,
        children != null && styles.alertWithDescription,
        variant === "info" && [primary.bgDim, primary.borderDim, primary.text],
        variant === "success" && [
          success.bgDim,
          success.borderDim,
          success.text,
        ],
        variant === "warning" && [
          warning.bgDim,
          warning.borderDim,
          warning.text,
        ],
        variant === "critical" && [
          critical.bgDim,
          critical.borderDim,
          critical.text,
        ],
        style,
      )}
      {...props}
    >
      {displayIcon != null && (
        <div {...stylex.props(styles.icon)}>{displayIcon}</div>
      )}
      <div
        {...stylex.props(
          styles.content,
          children != null && styles.contentWithDescription,
        )}
      >
        {title != null && (
          <Text size="base" weight="semibold">
            {title}
          </Text>
        )}
        {children != null && (
          <Text size="sm" variant="secondary" data-alert-description>
            {children}
          </Text>
        )}
      </div>
      {hasAction && (
        <div {...stylex.props(styles.action, actionStyles)}>{action}</div>
      )}
      {hasCloseButton && (
        <IconButton
          aria-label="Dismiss alert"
          size={size}
          variant="tertiary"
          onPress={onDismiss}
          style={[
            actionStyles,
            styles.closeButton,
            hasAction && styles.actionAndClose,
          ]}
        >
          <X />
        </IconButton>
      )}
    </div>
  );
};
