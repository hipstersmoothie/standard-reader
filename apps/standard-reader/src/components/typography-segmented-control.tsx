import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import type * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * A single-select segmented control for a reading-typography option (text size,
 * column width, body font). Holds its own optimistic selection so the control
 * feels instant, applying the change on the next frame. Shared by Settings and
 * the onboarding wizard.
 */
export function TypographySegmentedControl<T extends string>({
  value,
  options,
  label,
  onChange,
  style,
}: {
  value: T;
  options: ReadonlyArray<T>;
  label: (option: T) => string;
  onChange: (next: T) => void;
  style?: stylex.StyleXStyles;
}) {
  const [selected, setSelected] = useState(value);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const selectedKeys = useMemo(() => new Set([selected]), [selected]);

  const handleSelectionChange = useCallback(
    (keys: Set<React.Key> | "all") => {
      const key = keys === "all" ? undefined : String([...keys][0]);
      if (
        typeof key === "string" &&
        (options as ReadonlyArray<string>).includes(key)
      ) {
        const next = key as T;
        setSelected(next);
        requestAnimationFrame(() => onChange(next));
      }
    },
    [onChange, options],
  );

  return (
    <SegmentedControl
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      style={style}
    >
      {options.map((option) => (
        <SegmentedControlItem key={option} id={option}>
          {label(option)}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
