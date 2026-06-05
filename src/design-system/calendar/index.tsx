import type {
  CalendarProps as AriaCalendarProps,
  CalendarGridProps,
  DateValue,
  Key,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContext } from "react";
import { useDateFormatter } from "react-aria";
import {
  Calendar as AriaCalendarComponent,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { ErrorMessage } from "../label";
import { Select, SelectItem } from "../select";
import { gap } from "../theme/semantic-spacing.stylex";
import { useCalendarStyles } from "../theme/useCalendarStyles";

export interface CalendarProps<T extends DateValue>
  extends
    StyleXComponentProps<AriaCalendarProps<T>>,
    Pick<CalendarGridProps, "weekdayStyle"> {
  errorMessage?: string;
}

const styles = stylex.create({
  header: {
    gap: gap["md"],
    alignItems: "center",
    display: "flex",
  },
  headerContent: {
    gap: gap["xxs"],
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
  },
  select: {
    width: "fit-content",
  },
});

/**
 * A month option for the calendar header dropdown.
 */
interface MonthItem {
  id: number;
  date: DateValue;
  formatted: string;
}

/**
 * A year option for the calendar header dropdown.
 */
interface YearItem {
  id: number;
  date: DateValue;
  formatted: string;
}

function getNumericKey(key: Key) {
  if (typeof key === "number") return key;

  const parsedKey = Number(key);

  return Number.isNaN(parsedKey) ? null : parsedKey;
}

function MonthDropdown() {
  const state = useContext(CalendarStateContext);
  const formatter = useDateFormatter({
    month: "short",
    timeZone: state?.timeZone,
  });

  if (!state) return null;

  const months: Array<MonthItem> = [];
  const monthsInYear = state.focusedDate.calendar.getMonthsInYear(
    state.focusedDate,
  );

  for (let month = 1; month <= monthsInYear; month++) {
    const date = state.focusedDate.set({ month });

    months.push({
      id: month,
      date,
      formatted: formatter.format(date.toDate(state.timeZone)),
    });
  }

  return (
    <Select
      aria-label="Month"
      items={months}
      variant="tertiary"
      value={state.focusedDate.month}
      style={styles.select}
      onChange={(key) => {
        const month = months.find(
          (item) => key && item.id === getNumericKey(key),
        );

        if (month) {
          state.setFocusedDate(
            month.date as Parameters<typeof state.setFocusedDate>[0],
          );
        }
      }}
    >
      {(item) => <SelectItem>{item.formatted}</SelectItem>}
    </Select>
  );
}

function YearDropdown() {
  const state = useContext(CalendarStateContext);
  const formatter = useDateFormatter({
    year: "numeric",
    timeZone: state?.timeZone,
  });

  if (!state) return null;

  const years: Array<YearItem> = [];
  const selectedYearId = 20;

  for (let yearOffset = -20; yearOffset <= 20; yearOffset++) {
    const date = state.focusedDate.add({ years: yearOffset });

    years.push({
      id: years.length,
      date,
      formatted: formatter.format(date.toDate(state.timeZone)),
    });
  }

  return (
    <Select
      aria-label="Year"
      variant="tertiary"
      items={years}
      value={selectedYearId}
      style={styles.select}
      onChange={(key) => {
        const year = years.find(
          (item) => key && item.id === getNumericKey(key),
        );

        if (year) {
          state.setFocusedDate(
            year.date as Parameters<typeof state.setFocusedDate>[0],
          );
        }
      }}
    >
      {(item) => <SelectItem>{item.formatted}</SelectItem>}
    </Select>
  );
}

export function Calendar<T extends DateValue>(props: CalendarProps<T>) {
  const { style, errorMessage, weekdayStyle, visibleDuration, ...rest } = props;
  const monthsVisible = Array.from({
    length: visibleDuration?.months || 1,
  }).map((_, index) => index);
  const calendarStyles = useCalendarStyles({ type: "calendar" });

  return (
    <AriaCalendarComponent
      visibleDuration={visibleDuration}
      {...rest}
      {...stylex.props(calendarStyles.wrapper, style)}
    >
      <header {...stylex.props(styles.header)}>
        <IconButton
          variant="secondary"
          slot="previous"
          aria-label="Previous month"
        >
          <ChevronLeft />
        </IconButton>
        <div {...stylex.props(styles.headerContent)}>
          <MonthDropdown />
          <YearDropdown />
        </div>
        <IconButton variant="secondary" slot="next" aria-label="Next month">
          <ChevronRight />
        </IconButton>
      </header>
      <Flex align="start" gap="2xl">
        {monthsVisible.map((month) => (
          <CalendarGrid
            key={month}
            weekdayStyle={weekdayStyle}
            offset={{ months: month }}
            {...stylex.props(calendarStyles.grid)}
          >
            <CalendarGridHeader>
              {(day) => (
                <CalendarHeaderCell
                  {...stylex.props(calendarStyles.headerCell)}
                >
                  {day}
                </CalendarHeaderCell>
              )}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => (
                <CalendarCell
                  date={date}
                  {...stylex.props(calendarStyles.cell)}
                />
              )}
            </CalendarGridBody>
          </CalendarGrid>
        ))}
      </Flex>
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
    </AriaCalendarComponent>
  );
}
