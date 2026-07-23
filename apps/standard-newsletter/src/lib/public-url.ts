/**
 * The app's public origin, used to build the OAuth client_id / redirect_uris and
 * links. Prefers PUBLIC_URL; on Railway PR previews the per-deploy domain so the
 * OAuth round-trip returns to this deployment, not prod.
 */
export function getPublicUrl(): string {
  const explicit = process.env.PUBLIC_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;

  return "http://127.0.0.1:3100";
}
