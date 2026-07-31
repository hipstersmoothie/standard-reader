import { useEffect, useState } from "react";

/**
 * A value that trails its input by `delayMs`, settling once changes stop.
 *
 * For search boxes whose query drives a server round trip: bind the input to
 * local state so typing stays instant, and feed the debounced value to the
 * query so a five-character search costs one request instead of five.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
    // `settled` is deliberately excluded: including it would restart the timer
    // when it lands, and the `value === settled` guard above already makes the
    // no-change case free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return settled;
}
