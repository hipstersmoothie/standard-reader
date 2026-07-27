/** Whether an AT Proto OAuth client error is a missing repo scope. */
export function isAtprotoScopeMissingError(
  error: unknown,
  collection?: string,
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("ScopeMissingError")) {
    return false;
  }
  if (collection) {
    return message.includes(collection);
  }
  return true;
}
