import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthRequiredError, InvalidRequestError } from "./errors";
import * as catalog from "./handlers/catalog";
import * as feeds from "./handlers/feeds";
import * as reader from "./handlers/reader";
import * as writes from "./handlers/writes";
import { XRPC_WRITE_SCOPES } from "./scopes";
import { mockAuth, mockXrpcContext } from "./test/helpers";

const { searchPublications, searchArticles, resolvePublicationByHandle } =
  vi.hoisted(() => ({
    searchPublications: vi.fn(),
    searchArticles: vi.fn(),
    resolvePublicationByHandle: vi.fn(),
  }));

const resolvePageUrl = vi.hoisted(() => vi.fn());

vi.mock("#/integrations/tanstack-query/api-search.functions", () => ({
  searchApi: {
    searchPublications,
    searchArticles,
    resolvePublicationByHandle,
  },
}));

vi.mock("#/server/extension/resolve-page-url.server", () => ({
  resolvePageUrl,
  resolvePageUrls: vi.fn(),
}));

describe("XRPC catalog handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleResolveUrl requires url or urls", async () => {
    await expect(
      catalog.handleResolveUrl(mockXrpcContext({ params: {} })),
    ).rejects.toThrow(InvalidRequestError);
  });

  it("handleResolveUrl rejects empty urls batch", async () => {
    await expect(
      catalog.handleResolveUrl(mockXrpcContext({ params: { urls: "  ,  " } })),
    ).rejects.toThrow(/urls must not be empty/i);
  });

  it("handleSearchPublications returns cursor pages", async () => {
    searchPublications.mockResolvedValueOnce({
      query: "reader",
      items: [
        {
          uri: "at://did:plc:ex/site.standard.publication/abc",
          did: "did:plc:ex",
          name: "Example Pub",
          url: "https://example.com",
          description: null,
          iconUrl: null,
          ownerAvatarUrl: null,
          ownerHandle: null,
          topic: null,
          verified: false,
          subscriberCount: 1,
          documentCount: 2,
          lastDocumentAt: null,
        },
      ],
      total: 1,
      nextOffset: null,
    });

    const result = await catalog.handleSearchPublications(
      mockXrpcContext({ params: { q: "reader" } }),
    );

    expect(result).toEqual({
      query: "reader",
      cursor: null,
      items: [
        expect.objectContaining({
          uri: "at://did:plc:ex/site.standard.publication/abc",
          name: "Example Pub",
        }),
      ],
    });
  });

  it("handleResolveHandle maps publication views", async () => {
    resolvePublicationByHandle.mockResolvedValueOnce({
      did: "did:plc:ex",
      handle: "example.com",
      source: "index",
      publications: [
        {
          uri: "at://did:plc:ex/site.standard.publication/abc",
          did: "did:plc:ex",
          name: "Example Pub",
          url: "https://example.com",
          description: null,
          iconUrl: null,
          ownerAvatarUrl: null,
          ownerHandle: null,
          topic: null,
          verified: false,
          subscriberCount: 0,
          documentCount: 0,
          lastDocumentAt: null,
        },
      ],
    });

    const result = await catalog.handleResolveHandle(
      mockXrpcContext({ params: { handle: "example.com" } }),
    );

    expect(result.source).toBe("index");
    expect(result.publications).toHaveLength(1);
    expect(result.publications[0]?.name).toBe("Example Pub");
  });

  it("handleGetPublication requires publication param", async () => {
    await expect(
      catalog.handleGetPublication(mockXrpcContext({ params: {} })),
    ).rejects.toThrow(/Missing required parameter: publication/);
  });

  it("handleGetDocument requires document param", async () => {
    await expect(
      catalog.handleGetDocument(mockXrpcContext({ params: {} })),
    ).rejects.toThrow(/Missing required parameter: document/);
  });
});

describe("XRPC feed handlers", () => {
  it("handleGetTagFeed requires tag param", async () => {
    await expect(
      feeds.handleGetTagFeed(mockXrpcContext({ params: {} })),
    ).rejects.toThrow(/Missing required parameter: tag/);
  });

  it("handleGetList requires list param", async () => {
    await expect(
      feeds.handleGetList(mockXrpcContext({ params: {} })),
    ).rejects.toThrow(/Missing required parameter: list/);
  });
});

describe("XRPC reader handlers", () => {
  it("handleGetHomeFeed requires authentication", async () => {
    await expect(reader.handleGetHomeFeed(mockXrpcContext())).rejects.toThrow(
      AuthRequiredError,
    );
  });

  it("handleGetFollowStatus allows public lookup when did is set", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await reader.handleGetFollowStatus(
      mockXrpcContext({
        params: {
          did: "did:plc:reader",
          publication: "at://did:plc:ex/site.standard.publication/abc",
        },
        db: { select } as unknown as ReturnType<typeof mockXrpcContext>["db"],
        schema: {
          subscriptions: {
            uri: "uri",
            subscriberDid: "subscriberDid",
            publicationUri: "publicationUri",
            deleted: "deleted",
          },
        } as unknown as ReturnType<typeof mockXrpcContext>["schema"],
      }),
    );

    expect(result).toEqual({ active: false });
  });

  it("handleGetFollowStatus returns inactive when did and auth are omitted", async () => {
    const result = await reader.handleGetFollowStatus(
      mockXrpcContext({
        params: {
          publication: "at://did:plc:ex/site.standard.publication/abc",
        },
      }),
    );

    expect(result).toEqual({ active: false });
  });
});

describe("XRPC write handlers", () => {
  it("handleFollowPublication requires an authenticated PDS client", async () => {
    await expect(
      writes.handleFollowPublication(
        mockXrpcContext({
          auth: mockAuth({ client: null }),
          body: {
            publication: "at://did:plc:ex/site.standard.publication/abc",
          },
        }),
      ),
    ).rejects.toThrow(AuthRequiredError);
  });

  it("handleFollowPublication requires publication in the body", async () => {
    await expect(
      writes.handleFollowPublication(
        mockXrpcContext({
          auth: mockAuth({
            client: {} as never,
            scopes: [XRPC_WRITE_SCOPES.subscription],
          }),
          body: {},
        }),
      ),
    ).rejects.toThrow(/Missing required field: publication/);
  });
});
