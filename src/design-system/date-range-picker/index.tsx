import type {
  DateRangePickerProps as AriaDateRangePickerProps,
  DateValue,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { CalendarIcon } from "lucide-react";
import { use } from "react";
import {
  DateRangePicker as AriaDateRangePicker,
  Popover as AriaPopover,
  DateInput,
  DateSegment,
  Dialog,
  Group,
} from "react-aria-components";

import type { RangeCalendarProps } from "../range-calendar";
import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";

import { SizeContext } from "../context";
import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { Description, FieldErrorMessage, Label } from "../label";
import { RangeCalendar } from "../range-calendar";
import { SuffixIcon } from "../suffix-icon";
import { uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontSize } from "../theme/typography.stylex";
import { useInputStyles } from "../theme/useInputStyles";
import { usePopoverStyles } from "../theme/usePopoverStyles";

export interface DateRangePickerProps<T extends DateValue>
  extends
    StyleXComponentProps<Omit<AriaDateRangePickerProps<T>, "isInvalid">>,
    Pick<RangeCalendarProps<T>, "weekdayStyle" | "visibleDuration"> {
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  variant?: InputVariant;
  labelVariant?: LabelVariant;
  validationState?: InputValidationState;
}

const styles = stylex.create({
  group: {
    gap: gap["xs"],
    alignItems: "center",
    display: "flex",

    fontSize: {
      ":is([data-size=lg])": fontSize["base"],
      ":is([data-size=md])": fontSize["sm"],
      ":is([data-size=sm])": fontSize["xs"],
    },
  },
  popoverContent: {
    paddingBottom: verticalSpace["sm"],
    paddingLeft: horizontalSpace["sm"],
    paddingRight: horizontalSpace["sm"],
    paddingTop: verticalSpace["sm"],
  },
  separator: {
    paddingRight: {
      ":is([data-size=lg] *)": horizontalSpace["xs"],
      ":is([data-size=md] *)": horizontalSpace["sm"],
      ":is([data-size=sm] *)": horizontalSpace["xxs"],
    },
  },
  lastInput: {
    paddingRight: 0,
  },
  segment: {
    color: {
      ":is([data-placeholder])": uiColor.text1,
    },
  },
});

interface DateRangePickerContentProps<T extends DateValue> {
  label?: React.ReactNode;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size: Size;
  variant: InputVariant | undefined;
  validationState: InputValidationState | undefined;
  isInvalid: boolean;
  weekdayStyle?: RangeCalendarProps<T>["weekdayStyle"];
  visibleDuration?: RangeCalendarProps<T>["visibleDuration"];
}

function DateRangePickerContent<T extends DateValue>({
  label,
  labelVariant,
  description,
  errorMessage,
  size,
  variant,
  validationState,
  isInvalid,
  weekdayStyle,
  visibleDuration,
}: DateRangePickerContentProps<T>) {
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState: isInvalid ? "invalid" : validationState,
  });
  const popoverStyles = usePopoverStyles();

  const content = (
    <>
      <Group
        data-size={size}
        {...stylex.props(inputStyles.wrapper, styles.group)}
      >
        <DateInput slot="start" {...stylex.props(inputStyles.input)}>
          {(segment) => (
            <DateSegment segment={segment} {...stylex.props(styles.segment)} />
          )}
        </DateInput>
        <div aria-hidden="true" {...stylex.props(styles.separator)}>
          -
        </div>
        <DateInput
          slot="end"
          {...stylex.props(inputStyles.input, styles.lastInput)}
        >
          {(segment) => (
            <DateSegment segment={segment} {...stylex.props(styles.segment)} />
          )}
        </DateInput>
        <SuffixIcon
          suffix={
            <IconButton
              size="sm"
              aria-label="Open date picker"
              variant="tertiary"
            >
              <CalendarIcon />
            </IconButton>
          }
          style={inputStyles.addon}
          validationIconStyle={inputStyles.validationIcon}
          validationState={validationState}
        />
      </Group>
      <Description style={inputStyles.description}>{description}</Description>
      <FieldErrorMessage style={inputStyles.errorMessage}>
        {errorMessage}
      </FieldErrorMessage>
    </>
  );

  return (
    <>
      <Label style={inputStyles.label}>{label}</Label>
      {labelVariant === "horizontal" ? (
        <Flex direction="column" gap="md">
          {content}
        </Flex>
      ) : (
        content
      )}
      <AriaPopover
        {...stylex.props(popoverStyles.wrapper, popoverStyles.animation)}
      >
        <Dialog {...stylex.props(styles.popoverContent)}>
          <RangeCalendar
            weekdayStyle={weekdayStyle}
            visibleDuration={visibleDuration}
          />
        </Dialog>
      </AriaPopover>
    </>
  );
}

export function DateRangePicker<T extends DateValue>({
  label,
  description,
  errorMessage,
  style,
  size: sizeProp,
  weekdayStyle,
  visibleDuration,
  variant,
  labelVariant,
  validationState,
  ...props
}: DateRangePickerProps<T>) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaDateRangePicker
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid }) => (
          <DateRangePickerContent
            label={label}
            labelVariant={labelVariant}
            description={description}
            errorMessage={errorMessage}
            size={size}
            variant={variant}
            validationState={validationState}
            isInvalid={isInvalid}
            weekdayStyle={weekdayStyle}
            visibleDuration={visibleDuration}
          />
        )}
      </AriaDateRangePicker>
    </SizeContext>
  );
}
