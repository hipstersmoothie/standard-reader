# Lit + CDN example

A two-file Standard Reader blog reader with **no build step** — every dependency
loads from [jsDelivr](https://www.jsdelivr.com/)'s ESM CDN via an import map.

- **`index.html`** — the blog index. Uses the typed lexicon client
  ([`@standard-reader/lexicons`](https://www.npmjs.com/package/@standard-reader/lexicons)
  - [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)) to
    call `getAuthor` and `getPublicationDocuments`, and renders the author header +
    each publication's posts as a Lit element.
- **`post.html`** — the post viewer. Calls `getDocument` (one call returns
  metadata **and** the renderable body) and renders it with the
  [`@standard-reader/renderer-lit`](https://www.npmjs.com/package/@standard-reader/renderer-lit)
  `<standard-document>` web component. Embedded Bluesky posts are rendered by
  plugging the [`bluesky-post-embed`](https://www.npmjs.com/package/bluesky-post-embed)
  `<bluesky-post>` element into the renderer's `blueskyEmbed` component slot.

## Run it

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000
```

Any static file server works — there's nothing to compile.

## Any profile

Pass `?handle=` to view any author — a handle or a raw DID:

```
index.html?handle=cameron.stream
index.html?handle=did:plc:gfrmhdmjvxn2sjedzboeudef
```

With no query string it defaults to a sample profile. There's also a small
switcher input at the top of the page. Handles are resolved to a DID with
`com.atproto.identity.resolveHandle` (Bluesky's public, CORS-open API); DIDs are
used as-is. `getAuthor` itself takes a DID.
