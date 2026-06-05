import type {
  DatePickerProps as AriaDatePickerProps,
  DateValue,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { CalendarIcon } from "lucide-react";
import { use } from "react";
import {
  DatePicker as AriaDatePicker,
  Popover as AriaPopover,
  Dialog,
  Group,
} from "react-aria-components";

import type { CalendarProps } from "../calendar";
import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";

import { Calendar } from "../calendar";
import { SizeContext } from "../context";
import { DateField } from "../date-field";
import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { Description, FieldErrorMessage, Label } from "../label";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { useInputStyles } from "../theme/useInputStyles";
import { usePopoverStyles } from "../theme/usePopoverStyles";

export interface DatePickerProps<T extends DateValue>
  extends
    StyleXComponentProps<Omit<AriaDatePickerProps<T>, "isInvalid">>,
    Pick<CalendarProps<T>, "weekdayStyle" | "visibleDuration"> {
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  variant?: InputVariant;
  labelVariant?: LabelVariant;
  validationState?: InputValidationState;
}

const styles = stylex.create({
  popoverContent: {
    paddingBottom: verticalSpace["sm"],
    paddingLeft: horizontalSpace["sm"],
    paddingRight: horizontalSpace["sm"],
    paddingTop: verticalSpace["sm"],
  },
});

interface DatePickerContentProps<T extends DateValue> {
  label?: React.ReactNode;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size: Size;
  variant: InputVariant | undefined;
  validationState: InputValidationState | undefined;
  isInvalid: boolean;
  weekdayStyle?: CalendarProps<T>["weekdayStyle"];
  visibleDuration?: CalendarProps<T>["visibleDuration"];
}

function DatePickerContent<T extends DateValue>({
  label,
  labelVariant,
  description,
  errorMessage,
  size,
  variant,
  validationState,
  isInvalid: _isInvalid,
  weekdayStyle,
  visibleDuration,
}: DatePickerContentProps<T>) {
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });
  const popoverStyles = usePopoverStyles();

  const content = (
    <>
      <Group>
        <DateField
          variant={variant}
          validationState={validationState}
          suffix={
            <IconButton
              size="sm"
              aria-label="Open date picker"
              variant="tertiary"
            >
              <CalendarIcon />
            </IconButton>
          }
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
          <Calendar
            weekdayStyle={weekdayStyle}
            visibleDuration={visibleDuration}
          />
        </Dialog>
      </AriaPopover>
    </>
  );
}

export function DatePicker<T extends DateValue>({
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
}: DatePickerProps<T>) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaDatePicker
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid }) => (
          <DatePickerContent
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
      </AriaDatePicker>
    </SizeContext>
  );
}
