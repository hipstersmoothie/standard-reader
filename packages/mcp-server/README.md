# `@standard-reader/mcp`

A [Model Context Protocol](https://modelcontextprotocol.io) server over the
[Standard Reader](https://standard-reader.app) XRPC API. It lets an MCP client —
Claude Desktop, Claude Code, Cursor, or anything else that speaks MCP — search
and read long-form writing published on the AT Protocol, and act on a reader's
behalf: bookmark, like, follow, mark read, and curate lists.

It is a thin wrapper. Every call goes through
[`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)
against the generated
[`@standard-reader/lexicons`](https://www.npmjs.com/package/@standard-reader/lexicons)
schemas, so params, request bodies and response shapes come from the same
lexicons the AppView is built from. The package adds no business logic of its
own — only transport, auth, argument validation, and the grouping of ~50 XRPC
methods into 15 tools.

## Install

```bash
npx @standard-reader/mcp login   # one-time: store a session
```

Then register it with your MCP client. For Claude Desktop
(`claude_desktop_config.json`) or Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "standard-reader": {
      "command": "npx",
      "args": ["-y", "@standard-reader/mcp"]
    }
  }
}
```

## Authentication

Standard Reader is an AT Protocol AppView: articles live in `standard.site`
publications, and every reader's bookmarks, likes, follows, read state and lists
are records in **their own repo** on their PDS. Writing any of those needs the
reader's own credential.

This server signs in with an **app password** — never your account password.
Create one at [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)
(or your PDS's equivalent), then either:

```bash
npx @standard-reader/mcp login
```

which prompts for your handle and app password (hidden) and stores the session
at `$XDG_STATE_HOME/standard-reader-mcp/session.json` (`~/.local/state/…` by
default) with `0600` permissions — or set credentials in the server's
environment for headless hosts:

```json
{
  "mcpServers": {
    "standard-reader": {
      "command": "npx",
      "args": ["-y", "@standard-reader/mcp"],
      "env": {
        "STANDARD_READER_IDENTIFIER": "your.handle",
        "STANDARD_READER_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

The password is deliberately **not** accepted as a tool argument, so it never
passes through a model's context.

Public reads work with no credential at all — search, articles, publications,
authors, trending, tags, and the publication directory are all anonymous.

> **Why an app password and not OAuth?** An AT Protocol OAuth access token is
> DPoP-bound: it is only valid when presented together with a proof signed by
> the client's private key. The AppView validates a caller's token by forwarding
> it to `com.atproto.server.getSession` on the issuer PDS, and it cannot forge
> that proof, so a third-party OAuth token can't be validated this way. An
> app-password session token is a plain bearer token and validates correctly.
> (A browser app such as Standard Reader itself uses OAuth, because it holds the
> DPoP key and talks to the PDS directly.)

## Tools

The XRPC API has around fifty methods. A model picks better from a short list of
intents than a long list of endpoints, so they are grouped into 15 tools. Each
routes to the right method(s) from its arguments.

| Tool              | Covers                                                                                                                                                                                          | Auth    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `auth`            | sign-in status, instructions, sign out                                                                                                                                                          | —       |
| `search`          | `searchDocuments`, `searchPublications`                                                                                                                                                         | —       |
| `resolve`         | `resolveUrl`, `resolveHandle`                                                                                                                                                                   | —       |
| `get_article`     | `getDocument`, `getDocumentContext`                                                                                                                                                             | —       |
| `get_publication` | `getPublication`, `getPublicationDocuments`, `getPublicationSubscribers`                                                                                                                        | —       |
| `get_author`      | `getAuthor`, `getAuthorPublications`, `getAuthorPosts`                                                                                                                                          | —       |
| `get_feed`        | `getHomeFeed`, `getLatestFeed`, `getTrendingDocuments`, `getTrendingPublications`, `getTagFeed`, `getListFeed`, `getPublications`, `getRecommendedPublications`, `getFollowedByPeopleYouFollow` | partial |
| `get_lists`       | `getList`, `getUserLists`                                                                                                                                                                       | partial |
| `get_library`     | `getSaved`, `getReadingHistory`, `getLikes`, `getUserSubscriptions`                                                                                                                             | ✓       |
| `get_status`      | `getReadStatus`, `getBookmarkStatus`, `getRecommendStatus`, `getFollowStatus`, `getUserFollowStatus`                                                                                            | ✓       |
| `bookmark`        | `bookmarkDocument`, `unbookmarkDocument`                                                                                                                                                        | ✓       |
| `like`            | `recommendDocument`, `unrecommendDocument`                                                                                                                                                      | ✓       |
| `mark_read`       | `markRead`, `markUnread`, `markAllRead`, `markPublicationAllRead`                                                                                                                               | ✓       |
| `follow`          | `followPublication`, `unfollowPublication`, `followUser`, `unfollowUser`                                                                                                                        | ✓       |
| `manage_list`     | `createList`, `updateList`, `deleteList`, `saveList`, `unsaveList`                                                                                                                              | ✓       |

The labeler endpoints (`getLabelers`, `getLabeler`, `getLabels`,
`subscribeLabeler`, `unsubscribeLabeler`) are intentionally not exposed —
moderation configuration belongs in the app's settings UI, not in a model's tool
list.

### Conventions

- **Everything is addressed by AT-URI.** Tools validate `at://…` and `did:…`
  arguments up front and fail with a message naming the argument and its
  expected shape, rather than letting a malformed value reach the API.
- **Responses are trimmed.** The renderable article body and the pre-highlighted
  search markup are dropped unless asked for — pass `includeBody: true` to
  `get_article` when you actually need the prose.
- **Writes are public.** A bookmark, like, follow or list change writes a record
  to the user's own repo and is visible on the network. Confirm before acting on
  someone's behalf.

## CLI

```
standard-reader-mcp                 Serve MCP over stdio (what an MCP host runs)
standard-reader-mcp login           Sign in with an app password, store the session
standard-reader-mcp logout          Revoke and remove the stored session
standard-reader-mcp whoami          Print the stored session's account
```

## Environment

| Variable                       | Default                                            | Purpose                                                                |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `STANDARD_READER_SERVICE`      | `https://standard-reader.app`                      | AppView base URL; point at a preview deploy or `http://127.0.0.1:3000` |
| `STANDARD_READER_PDS`          | `https://bsky.social`                              | PDS/entryway used for the login handshake                              |
| `STANDARD_READER_SESSION_FILE` | `$XDG_STATE_HOME/standard-reader-mcp/session.json` | Where the session is stored                                            |
| `STANDARD_READER_IDENTIFIER`   | —                                                  | Handle, DID or email — sign in without a prior `login`                 |
| `STANDARD_READER_APP_PASSWORD` | —                                                  | App password to go with it                                             |

## Embedding

The server is transport-agnostic. Connect it to whatever transport your host
already has:

```ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "@standard-reader/mcp";

const server = createServer();
await server.connect(
  new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
);
```

## Development

```bash
pnpm --filter @standard-reader/mcp test
pnpm --filter @standard-reader/mcp typecheck
pnpm --filter @standard-reader/mcp build
pnpm --filter @standard-reader/mcp dev     # run the stdio server from source
```

## License

MIT
