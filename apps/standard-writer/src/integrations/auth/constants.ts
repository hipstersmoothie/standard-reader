/**
 * HttpOnly app session cookie. The token is an opaque random UUID that resolves
 * server-side to a `session` row (shared with Standard Reader's tables), which
 * authoritatively determines the user and DID. Never trust client-supplied DIDs.
 *
 * The name is writer-specific so the two apps' cookies don't collide when served
 * from the same parent domain.
 */
export const AUTH_SESSION_TOKEN_COOKIE = "standard-writer-auth.session_token";
