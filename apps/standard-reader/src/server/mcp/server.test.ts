import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { createMcpServer } from "./server";
import { MCP_SCOPES, McpSession } from "./session";

const READER_DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const ARTICLE = `at://${READER_DID}/site.standard.document/abc`;

async function connect(session: McpSession) {
  const server = createMcpServer(session);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function anonymous() {
  return new McpSession({ did: null, scopes: [] });
}

function readOnly() {
  return new McpSession({
    did: READER_DID,
    handle: "alice.example.com",
    scopes: [MCP_SCOPES.read],
    clientName: "Test Client",
  });
}

function textOf(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text;
}

describe("tool surface", () => {
  it("exposes one tool per intent, not one per XRPC method", async () => {
    const client = await connect(anonymous());
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
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
      "whoami",
    ]);
  });

  it("describes every tool and its arguments", async () => {
    const client = await connect(anonymous());
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("marks reads read-only and writes not", async () => {
    const client = await connect(anonymous());
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get("search")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("get_feed")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("bookmark")?.annotations?.readOnlyHint).toBe(false);
    expect(byName.get("follow")?.annotations?.readOnlyHint).toBe(false);
  });
});

describe("whoami", () => {
  it("reports an unauthorized connection as read-only and public", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "whoami",
      arguments: {},
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toMatchObject({
      authorized: false,
      canWrite: false,
    });
  });

  it("reports the reader and scopes of an authorized connection", async () => {
    const client = await connect(readOnly());
    const result = (await client.callTool({
      name: "whoami",
      arguments: {},
    })) as CallToolResult;

    expect(JSON.parse(textOf(result))).toMatchObject({
      authorized: true,
      did: READER_DID,
      handle: "alice.example.com",
      client: "Test Client",
      canWrite: false,
    });
  });
});

describe("authorization", () => {
  it("refuses a write on an unauthorized connection", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "bookmark",
      arguments: { article: ARTICLE },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Reconnect");
  });

  it("refuses a write when the connection has no mcp:write scope", async () => {
    const client = await connect(readOnly());
    const result = (await client.callTool({
      name: "like",
      arguments: { article: ARTICLE },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("mcp:write");
  });

  it("refuses a library read on an unauthorized connection", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "get_library",
      arguments: { section: "bookmarks" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("signed-in reader");
  });
});

describe("input validation", () => {
  it("rejects a malformed AT-URI before touching the read model", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "get_article",
      arguments: { article: "https://example.com/post" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("`article` must be a valid AT-URI");
  });

  it("reports a missing dependent argument", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "get_feed",
      arguments: { feed: "tag" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("requires a `tag`");
  });

  it("caps how many subjects one get_status call may check", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "get_status",
      arguments: {
        articles: Array.from({ length: 30 }, () => ARTICLE),
        did: READER_DID,
      },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Too many subjects");
  });

  it("rejects a handle where a DID belongs", async () => {
    const client = await connect(anonymous());
    const result = (await client.callTool({
      name: "get_author",
      arguments: { did: "alice.bsky.social" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("must be a valid DID");
  });
});
