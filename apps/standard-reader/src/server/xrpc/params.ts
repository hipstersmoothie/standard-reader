import { InvalidRequestError } from "./errors";

export function parseQueryParams(url: URL): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

export async function parseProcedureBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new InvalidRequestError("Expected application/json body");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InvalidRequestError("Invalid JSON body");
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestError("Procedure body must be a JSON object");
  }

  return body;
}

export function requireParam(
  params: Record<string, string | undefined>,
  key: string,
): string {
  const value = params[key]?.trim();
  if (!value) {
    throw new InvalidRequestError(`Missing required parameter: ${key}`);
  }
  return value;
}

export function optionalParam(
  params: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = params[key]?.trim();
  return value || undefined;
}

export function intParam(
  params: Record<string, string | undefined>,
  key: string,
  fallback: number,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = params[key];
  if (raw == null || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new InvalidRequestError(`Invalid integer parameter: ${key}`);
  }
  const min = opts.min ?? Number.MIN_SAFE_INTEGER;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  if (parsed < min || parsed > max) {
    throw new InvalidRequestError(
      `Parameter ${key} must be between ${min} and ${max}`,
    );
  }
  return parsed;
}

export function requireBodyField(body: unknown, key: string): string {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestError("Invalid request body");
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidRequestError(`Missing required field: ${key}`);
  }
  return value.trim();
}

export function optionalBodyField(
  body: unknown,
  key: string,
): string | undefined {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function bodyStringArray(body: unknown, key: string): Array<string> {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestError("Invalid request body");
  }
  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    throw new InvalidRequestError(`Missing required array field: ${key}`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new InvalidRequestError(`Invalid ${key}[${index}]`);
    }
    return entry.trim();
  });
}
