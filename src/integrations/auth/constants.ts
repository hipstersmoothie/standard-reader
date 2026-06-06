/**
 * HttpOnly app session cookie. The token is opaque (random UUID) and resolves
 * server-side to a `session` row, which authoritatively determines the user
 * (and therefore the DID) for the request. Never trust client-supplied DIDs.
 */
export const AUTH_SESSION_TOKEN_COOKIE = "standard-reader-auth.session_token";
