export interface PlausibleConfig {
  domain: string;
  endpoint?: string;
  captureOnLocalhost?: boolean;
  logging?: boolean;
}

export function getPlausibleConfig(): PlausibleConfig | null {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN?.trim();
  if (!domain) return null;

  const endpoint = import.meta.env.VITE_PLAUSIBLE_ENDPOINT?.trim();
  const captureOnLocalhost =
    import.meta.env.VITE_PLAUSIBLE_CAPTURE_ON_LOCALHOST === "true";

  return {
    domain,
    ...(endpoint ? { endpoint } : {}),
    captureOnLocalhost,
    logging: import.meta.env.DEV,
  };
}
