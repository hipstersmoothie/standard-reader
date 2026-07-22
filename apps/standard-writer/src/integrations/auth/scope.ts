import { scope as atprotoScope } from "@atcute/oauth-node-client";

/** Required on every AT Proto OAuth session (see atproto.com/specs/oauth). */
export const ATPROTO_BASE_SCOPE = "atproto";

/** Blob write for cover / inline images uploaded during authoring. */
const BLOB_SCOPE = atprotoScope.blob({ accept: ["image/*"] });

/**
 * Full standard.site record access — the authoring tier. Publishing writes
 * `site.standard.publication` + `site.standard.document` records to the
 * author's repo, so the writer requests the upstream `authFull` permission set
 * (the same one Standard Reader references for its collections feature).
 */
const SITE_AUTH_FULL = "include:site.standard.authFull";

/**
 * The scope Standard Writer requests at sign-in: a base session, blob upload,
 * and full standard.site authoring. Also published verbatim in the client
 * metadata as the set of scopes this client may ask for.
 */
export const authoringScope: Array<string> = [
  ATPROTO_BASE_SCOPE,
  BLOB_SCOPE,
  SITE_AUTH_FULL,
];

export const clientMetadataScope: Array<string> = authoringScope;
