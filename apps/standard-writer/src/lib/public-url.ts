/**
 * Public base URL for absolute links and the OAuth client identity
 * (`client_id`, `redirect_uris`, `jwks_uri`). On Railway PR previews each
 * deployment gets its own `RAILWAY_PUBLIC_DOMAIN` but inherits prod's
 * `PUBLIC_URL`; the OAuth round-trip must return to THIS deployment, so
 * previews resolve their base from `RAILWAY_PUBLIC_DOMAIN`.
 *
 * Locally, defaults to the loopback dev origin (Bluesky OAuth requires a
 * loopback IP, so `127.0.0.1`, not `localhost`).
 */
export function getPublicUrl(): string {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME;
  const productionEnvironment =
    process.env.RAILWAY_PRODUCTION_ENVIRONMENT || "production";
  if (
    railwayDomain &&
    environmentName &&
    environmentName !== productionEnvironment
  ) {
    return `https://${railwayDomain}`;
  }

  return (process.env.PUBLIC_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
}
