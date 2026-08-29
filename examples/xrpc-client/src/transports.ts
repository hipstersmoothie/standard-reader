/**
 * The transport probe — the check that actually catches a broken
 * `atproto-proxy` integration.
 *
 * A status code proves nothing here. Most reader-state queries are optionally
 * authenticated: they answer `200 {"active":false}` to an anonymous caller. So
 * when service-JWT verification was broken, every proxied call "passed" while
 * silently being treated as a stranger. The probe instead creates state that
 * only the signed-in reader can see, and requires each transport to see it.
 */

import type { StandardReaderClient, Transport } from "./client";
import type { Fixtures } from "./fixtures";

export type TransportCheck = {
  detail?: string;
  name: string;
  status: "fail" | "pass" | "skip";
};

type BookmarkStatus = { active?: boolean };

async function readsAsCaller(
  client: StandardReaderClient,
  documentUri: string,
): Promise<TransportCheck> {
  // No `did` parameter: the answer has to come from the credential, which is
  // the whole point. Passing `did=<self>` would make an anonymous call succeed.
  const result = await client.call("app.standard-reader.getBookmarkStatus", {
    params: { document: documentUri },
  });
  const active = (result.body as BookmarkStatus | null)?.active;
  if (result.status === 200 && active === true) {
    return {
      name: `${client.name}: reads as the signed-in reader`,
      status: "pass",
    };
  }
  return {
    name: `${client.name}: reads as the signed-in reader`,
    status: "fail",
    detail:
      result.status === 200
        ? `got ${result.raw.slice(0, 120)} — the caller was treated as anonymous`
        : `got ${result.status}: ${result.raw.slice(0, 160)}`,
  };
}

/**
 * A proxied write cannot work by construction: the service JWT that reaches us
 * identifies the caller but is not a credential we can replay at their PDS. We
 * promise to say so in words rather than return a bare 401 or a 502.
 */
async function explainsProxiedWrite(
  client: StandardReaderClient,
  documentUri: string,
): Promise<TransportCheck> {
  const result = await client.call("app.standard-reader.bookmarkDocument", {
    method: "POST",
    body: { document: documentUri },
  });
  const message =
    (result.body as { message?: string } | null)?.message ?? result.raw;
  const explains =
    result.status === 400 && /atproto-proxy|access token/i.test(message);
  return {
    name: `${client.name}: explains why a proxied write cannot work`,
    status: explains ? "pass" : "fail",
    detail: explains
      ? undefined
      : `got ${result.status}: ${result.raw.slice(0, 200)}`,
  };
}

export async function runTransportProbe(
  clients: Record<Transport, StandardReaderClient>,
  fixtures: Fixtures,
): Promise<Array<TransportCheck>> {
  const documentUri = fixtures.documentUri;
  if (!documentUri) {
    return [
      {
        name: "transport probe",
        status: "skip",
        detail: "no document fixture",
      },
    ];
  }

  const seed = await clients.direct.call(
    "app.standard-reader.bookmarkDocument",
    { method: "POST", body: { document: documentUri } },
  );
  if (!seed.ok) {
    return [
      {
        name: "transport probe",
        status: "fail",
        detail: `could not seed a bookmark: ${seed.status} ${seed.raw.slice(0, 160)}`,
      },
    ];
  }

  try {
    const checks: Array<TransportCheck> = [];
    for (const transport of ["direct", "proxy", "serviceAuth"] as const) {
      checks.push(await readsAsCaller(clients[transport], documentUri));
    }
    checks.push(await explainsProxiedWrite(clients.proxy, documentUri));
    return checks;
  } finally {
    await clients.direct.call("app.standard-reader.unbookmarkDocument", {
      method: "POST",
      body: { document: documentUri },
    });
  }
}
