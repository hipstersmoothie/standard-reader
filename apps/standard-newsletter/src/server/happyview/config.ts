/**
 * HappyView (AT Proto Proposal 0016 permissioned-space AppView) configuration,
 * read from the environment. When unset, the permissioned-space paths are
 * disabled and the app stays on the email-only DB flow, so nothing regresses
 * without a HappyView instance.
 *
 * See docs/happyview-runbook.md for how to stand one up on Railway.
 */

export interface HappyViewConfig {
  /** Origin of the HappyView instance, e.g. https://spaces.standard.site */
  url: string;
  /** App API client key (`hvc_...`); sent as X-Client-Key on every XRPC call. */
  clientKey: string;
  /** App API client secret (`hvs_...`); sent as X-Client-Secret on S2S calls. */
  clientSecret?: string;
  /** Space type NSID (defaults to app.standard-newsletter.list). */
  spaceType: string;
}

const DEFAULT_SPACE_TYPE = "app.standard-newsletter.list";

/**
 * The active HappyView config, or null when unconfigured (spaces disabled).
 * Requires at least HAPPYVIEW_URL and HAPPYVIEW_CLIENT_KEY.
 */
export function getHappyViewConfig(): HappyViewConfig | null {
  const rawUrl = process.env.HAPPYVIEW_URL?.trim();
  const clientKey = process.env.HAPPYVIEW_CLIENT_KEY;
  if (!rawUrl || !clientKey) return null;
  // Tolerate a bare host in HAPPYVIEW_URL (e.g. "example.up.railway.app"):
  // without a scheme, `${url}/xrpc/…` is a *relative* path and requests hit the
  // local server instead of HappyView. Default to https and strip any trailing
  // slash.
  const withScheme = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = withScheme.replace(/\/+$/, "");
  return {
    url,
    clientKey,
    clientSecret: process.env.HAPPYVIEW_CLIENT_SECRET,
    spaceType: process.env.HAPPYVIEW_SPACE_TYPE ?? DEFAULT_SPACE_TYPE,
  };
}

/** True when a HappyView instance is configured (permissioned spaces on). */
export function isHappyViewEnabled(): boolean {
  return getHappyViewConfig() !== null;
}
