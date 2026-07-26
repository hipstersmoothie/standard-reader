import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { McpServerConfig } from "./config.js";
import { createServer } from "./server.js";

const SERVICE = "https://appview.test";

const config: McpServerConfig = {
  service: SERVICE,
  pdsService: "https://pds.test",
  // A path inside a fresh temp dir, so no session is ever found and no
  // credential is ever written.
  sessionFile: join(mkdtempSync(join(tmpdir(), "sr-mcp-")), "session.json"),
  identifier: undefined,
  password: undefined,
};

/** URLs the client asked for, in order. */
let requested: Array<string> = [];

function connect() {
  const server = createServer({ config });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  return Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]).then(() => client);
}

function textOf(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text;
}

beforeEach(() => {
  requested = [];
  vi.stubGlobal("fetch", (input: URL | string) => {
    requested.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify({ items: [], cursor: undefined }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tool surface", () => {
  it("exposes one tool per intent, not one per XRPC method", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
      "auth",
      "bookmark",
      "follow",
      "get_article",
      "get_author",
      "get_feed",
      "get_library",
      "get_lists",
      "get_publication",
      "get_status",
      "like",
      "manage_list",
      "mark_read",
      "resolve",
      "search",
    ]);
  });

  it("describes every tool and its arguments", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("routing", () => {
  it("searches only the index that was asked for", async () => {
    const client = await connect();
    await client.callTool({
      name: "search",
      arguments: { query: "typography", type: "articles" },
    });

    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(
      `${SERVICE}/xrpc/app.standard-reader.searchDocuments`,
    );
    expect(requested[0]).toContain("q=typography");
  });

  it("fans one search across both indexes by default", async () => {
    const client = await connect();
    await client.callTool({
      name: "search",
      arguments: { query: "typography" },
    });

    expect(requested).toHaveLength(2);
    expect(requested.join(" ")).toContain("searchDocuments");
    expect(requested.join(" ")).toContain("searchPublications");
  });

  it("maps each feed to its own XRPC method", async () => {
    const client = await connect();
    await client.callTool({
      name: "get_feed",
      arguments: { feed: "trending_publications", limit: 5 },
    });

    expect(requested[0]).toContain(
      "app.standard-reader.getTrendingPublications",
    );
    expect(requested[0]).toContain("limit=5");
  });

  it("routes resolve by input shape", async () => {
    const client = await connect();
    await client.callTool({
      name: "resolve",
      arguments: { input: "https://example.com/an-article" },
    });
    await client.callTool({
      name: "resolve",
      arguments: { input: "@alice.example.com" },
    });

    expect(requested[0]).toContain("app.standard-reader.resolveUrl");
    expect(requested[1]).toContain("app.standard-reader.resolveHandle");
    expect(requested[1]).toContain("handle=alice.example.com");
  });
});

describe("input validation", () => {
  it("reports a missing dependent argument without calling the API", async () => {
    const client = await connect();
    const result = (await client.callTool({
      name: "get_feed",
      arguments: { feed: "tag" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("requires a `tag`");
    expect(requested).toHaveLength(0);
  });

  it("rejects a malformed AT-URI before it reaches the API", async () => {
    const client = await connect();
    const result = (await client.callTool({
      name: "get_article",
      arguments: { article: "https://example.com/post" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("`article` must be a valid AT-URI");
    expect(requested).toHaveLength(0);
  });
});

describe("auth gating", () => {
  it("reports signed-out status without failing", async () => {
    const client = await connect();
    const result = (await client.callTool({
      name: "auth",
      arguments: { action: "status" },
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toMatchObject({ signedIn: false });
  });

  it("refuses writes with a recoverable message when signed out", async () => {
    const client = await connect();
    const result = (await client.callTool({
      name: "bookmark",
      arguments: {
        article:
          "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/site.standard.document/abc",
      },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("signed-in reader");
    expect(requested).toHaveLength(0);
  });

  it("never sends an Authorization header when signed out", async () => {
    const client = await connect();
    await client.callTool({
      name: "get_feed",
      arguments: { feed: "trending_articles" },
    });

    expect(requested).toHaveLength(1);
  });
});
