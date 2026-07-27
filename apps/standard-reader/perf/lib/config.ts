import { AUTH_SESSION_TOKEN_COOKIE } from "../../src/integrations/auth/constants.ts";

export const SESSION_COOKIE_NAME = AUTH_SESSION_TOKEN_COOKIE;

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

export function perfBaseUrl(): string {
  return (process.env.PERF_TEST_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
}

/** Scale all budgets (e.g. `1.5` on a slow CI runner). */
export function perfBudgetMultiplier(): number {
  const raw = process.env.PERF_BUDGET_MULTIPLIER;
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function perfSessionToken(): string | undefined {
  const token = process.env.PERF_TEST_SESSION_TOKEN?.trim();
  return token || undefined;
}

export function perfTestIdentifier(): string | undefined {
  const value = process.env.PERF_TEST_IDENTIFIER?.trim();
  return value || undefined;
}

export function perfTestAppPassword(): string | undefined {
  const value = process.env.PERF_TEST_APP_PASSWORD?.trim();
  return value || undefined;
}

export function hasPerfAppPasswordCredentials(): boolean {
  return Boolean(perfTestIdentifier() && perfTestAppPassword());
}

export function perfDefaultTimeoutMs(): number {
  const raw = process.env.PERF_TEST_TIMEOUT_MS;
  if (!raw) return 45_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 45_000;
}

export function perfWarmupPasses(): number {
  const raw = process.env.PERF_TEST_WARMUP_PASSES;
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}
