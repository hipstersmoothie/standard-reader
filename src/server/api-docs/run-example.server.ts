import type { Did } from "@atcute/lexicons";
import type { ApiDocsCatalogEntry } from "#/lib/api-docs/catalog";
import type { ApiDocsExampleResult } from "#/lib/api-docs/types";
import type { XrpcAuthContext } from "#/server/xrpc/auth";

import { getRequest } from "@tanstack/react-start/server";
import { clientMetadataScope } from "#/integrations/auth/scope";
import {
  buildApiDocsCurl,
  resolveApiDocsExampleParams,
} from "#/lib/api-docs/build-curl";
import {
  autoRunnableCatalogEntries,
  catalogEntryByNsid,
} from "#/lib/api-docs/catalog";
import { isPlaceholderApiDocsFixture } from "#/lib/api-docs/fixture-defaults";
import { apiDocsUsesSessionAuth } from "#/lib/api-docs/interactive-params";
import { mergeApiDocsExampleBody } from "#/lib/api-docs/merge-example-params";
import { getPublicUrl } from "#/lib/public-url";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { loadApiDocsFixturesAsync } from "#/server/api-docs/fixtures.server";
import { getXrpcDbContext } from "#/server/xrpc/db";
import { dispatchXrpc } from "#/server/xrpc/dispatch";
import { handleXrpcError, xrpcJsonResponse } from "#/server/xrpc/errors";
import { XRPC_REGISTRY } from "#/server/xrpc/registry";

export type RunXrpcExampleOptions = {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  useSessionAuth?: boolean;
};

async function fetchXrpcExample(
  catalogEntry: ApiDocsCatalogEntry,
  baseUrl: string,
  params: Record<string, string>,
  body: unknown | undefined,
  authorization?: string,
): Promise<{ status: number; bodyJson: string }> {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/xrpc/${catalogEntry.nsid}`,
  );
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authorization) {
    headers.Authorization = authorization;
  }

  let response: Response;
  if (catalogEntry.method === "query") {
    response = await fetch(url.toString(), { headers });
  } else {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
  }

  const text = await response.text();
  let bodyJson = text;
  try {
    bodyJson = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // keep raw text
  }
  return { status: response.status, bodyJson };
}

async function dispatchXrpcExample(
  catalogEntry: ApiDocsCatalogEntry,
  baseUrl: string,
  params: Record<string, string>,
  body: unknown | undefined,
  requestHeaders?: HeadersInit,
): Promise<{ status: number; bodyJson: string }> {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/xrpc/${catalogEntry.nsid}`,
  );
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const request =
    catalogEntry.method === "query"
      ? new Request(url.toString(), { method: "GET", headers: requestHeaders })
      : new Request(url.toString(), {
          method: "POST",
          headers: {
            ...Object.fromEntries(new Headers(requestHeaders).entries()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body ?? {}),
        });

  const response = await dispatchXrpc(request);
  const text = await response.text();
  let bodyJson = text;
  try {
    bodyJson = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // keep raw text
  }
  return { status: response.status, bodyJson };
}

async function runWithSessionAuth(
  catalogEntry: ApiDocsCatalogEntry,
  params: Record<string, string>,
  body: unknown | undefined,
): Promise<{ status: number; bodyJson: string }> {
  const session = await getAtprotoSessionForRequest(getRequest());
  if (!session) {
    return {
      status: 401,
      bodyJson: JSON.stringify(
        {
          error: "AuthRequired",
          message: "Sign in to run this example.",
        },
        null,
        2,
      ),
    };
  }

  const registryEntry = XRPC_REGISTRY.get(catalogEntry.nsid);
  if (!registryEntry) {
    return {
      status: 404,
      bodyJson: JSON.stringify(
        { error: "NotFound", message: "Unknown NSID" },
        null,
        2,
      ),
    };
  }

  const baseUrl = getPublicUrl();
  const request =
    catalogEntry.method === "query"
      ? new Request(`${baseUrl}/xrpc/${catalogEntry.nsid}`)
      : new Request(`${baseUrl}/xrpc/${catalogEntry.nsid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });

  try {
    const { db, schema, trackReadingEnabled } = await getXrpcDbContext();
    const auth: XrpcAuthContext = {
      did: session.did as Did,
      client: session.client,
      scopes: clientMetadataScope,
      via: "accessToken",
    };
    const result = await registryEntry.handler({
      request,
      auth,
      db,
      schema,
      trackReadingEnabled,
      params,
      body: body ?? null,
    });
    const response = xrpcJsonResponse(result, 200);
    const text = await response.text();
    return {
      status: 200,
      bodyJson: JSON.stringify(JSON.parse(text), null, 2),
    };
  } catch (error) {
    const response = handleXrpcError(error);
    const payload = await response.json();
    return {
      status: response.status,
      bodyJson: JSON.stringify(payload, null, 2),
    };
  }
}

export async function runXrpcExample(
  nsid: string,
  options: RunXrpcExampleOptions = {},
): Promise<ApiDocsExampleResult> {
  const catalogEntry = catalogEntryByNsid(nsid);
  if (!catalogEntry) {
    return {
      nsid,
      curl: "",
      status: 404,
      bodyJson: JSON.stringify({ error: "NotFound", message: "Unknown NSID" }),
      durationMs: 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  const fixtures = await loadApiDocsFixturesAsync();
  const params = {
    ...resolveApiDocsExampleParams(catalogEntry, fixtures),
    ...options.params,
  };
  const body = mergeApiDocsExampleBody(catalogEntry, fixtures, options.body);

  const baseUrl = getPublicUrl();
  const useSession =
    options.useSessionAuth && apiDocsUsesSessionAuth(catalogEntry);
  const curl = buildApiDocsCurl(catalogEntry, baseUrl, fixtures, {
    params,
    body,
    bearerPlaceholder: useSession,
  });
  const started = performance.now();

  try {
    let result: { status: number; bodyJson: string };
    if (useSession) {
      result = await runWithSessionAuth(catalogEntry, params, body);
    } else {
      try {
        result = await fetchXrpcExample(catalogEntry, baseUrl, params, body);
      } catch {
        result = await dispatchXrpcExample(catalogEntry, baseUrl, params, body);
      }
    }

    return {
      nsid,
      curl,
      status: result.status,
      bodyJson: result.bodyJson,
      durationMs: Math.round(performance.now() - started),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Example request failed";
    return {
      nsid,
      curl,
      status: 500,
      bodyJson: JSON.stringify(
        { error: "InternalServerError", message },
        null,
        2,
      ),
      durationMs: Math.round(performance.now() - started),
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function runApiDocsExamples(): Promise<
  Array<ApiDocsExampleResult>
> {
  const fixtures = await loadApiDocsFixturesAsync();
  const entries = autoRunnableCatalogEntries().filter((entry) => {
    if (
      (entry.nsid === "app.standard-reader.getList" ||
        entry.nsid === "app.standard-reader.getListFeed") &&
      isPlaceholderApiDocsFixture(fixtures, "listUri")
    ) {
      return false;
    }
    return true;
  });
  return Promise.all(entries.map((entry) => runXrpcExample(entry.nsid)));
}
