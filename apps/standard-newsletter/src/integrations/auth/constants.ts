/**
 * HttpOnly app-session cookie. The value is an opaque random UUID that resolves
 * to a `session` row; the user's DID is always re-derived server-side from the
 * joined `user` row — never trusted from the client. Distinct from the reader's
 * cookie name so the two apps keep independent sessions on the shared tables.
 */
export const AUTH_SESSION_TOKEN_COOKIE =
  "standard-newsletter-auth.session_token";

/** App session lifetime. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
