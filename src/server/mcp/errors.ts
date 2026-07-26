/** Raised when a tool needs a signed-in reader and there is no session. */
export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** Raised when tool input is well-formed JSON but semantically unusable. */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * Render any thrown value as a single line for an MCP error result. XRPC
 * failures from `@atproto/lex-client` carry the lexicon error name and
 * description, which is exactly what a model needs to self-correct, so keep
 * them verbatim rather than collapsing to "request failed".
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error && cause.message !== error.message) {
      return `${error.message} (${cause.message})`;
    }
    return error.message;
  }
  return typeof error === "string" ? error : JSON.stringify(error);
}
