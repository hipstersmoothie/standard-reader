# TypeScript — Client metadata and JWKS

The Node and Browser clients both build their own `clientMetadata` object from your constructor input. Your job is to **serve it** at the URL you use as `client_id`, and (for confidential clients) to serve the matching `jwks.json`. This file is the Node/Express plumbing. For the rules themselves, see `../shared/client-metadata.md`.

## Node (confidential BFF) — the two endpoints

```ts
import express from 'express'
import { NodeOAuthClient } from '@atproto/oauth-client-node'
import { JoseKey } from '@atproto/jwk-jose'

const client = new NodeOAuthClient({
  clientMetadata: {
    client_id:                        'https://app.example.com/oauth-client-metadata.json',
    client_name:                      'Example App',
    client_uri:                       'https://app.example.com',
    redirect_uris:                    ['https://app.example.com/oauth/callback'],
    grant_types:                      ['authorization_code', 'refresh_token'],
    response_types:                   ['code'],
    scope:                            'atproto transition:generic',
    application_type:                 'web',
    token_endpoint_auth_method:       'private_key_jwt',
    token_endpoint_auth_signing_alg:  'ES256',
    dpop_bound_access_tokens:         true,
    jwks_uri:                         'https://app.example.com/jwks.json',
  },
  keyset: await Promise.all([
    JoseKey.fromImportable(process.env.PRIVATE_KEY_1!, 'key-1'),
    JoseKey.fromImportable(process.env.PRIVATE_KEY_2!, 'key-2'),   // rotation
  ]),
  stateStore,
  sessionStore,
  requestLock,
})

const app = express()

app.get('/oauth-client-metadata.json', (_req, res) =>
  res.type('application/json').json(client.clientMetadata))

app.get('/jwks.json', (_req, res) =>
  res.type('application/json').json(client.jwks))
```

`client.clientMetadata` echoes what you passed in, plus the library-computed `jwks_uri` if not provided. `client.jwks` is `{ keys: JsonWebKey[] }` — **public halves only** (the library strips private components before exposing).

Never build the `jwks.json` response by hand from your raw keys — use `client.jwks`. The library is the single source of truth for what gets published.

## Key loading: `@atproto/jwk-jose`

`JoseKey` is the wrapper around `jose`'s `KeyLike`/`CryptoKey` that `NodeOAuthClient` expects.

```ts
import { JoseKey } from '@atproto/jwk-jose'

// 1. Generate a new key (dev-only — store the PEM in secret storage):
const key = await JoseKey.generate(['ES256'])
console.log(await key.toPEM())

// 2. Load from PEM (most common in production):
const key = await JoseKey.fromImportable(process.env.PRIVATE_KEY_PEM!, 'key-id-1')
// `key.kid` = 'key-id-1'
// `key.alg` = 'ES256'

// 3. Load from JWK:
const key = await JoseKey.fromJWK({ kty: 'EC', crv: 'P-256', ..., kid: 'key-id-1' })
```

The `kid` (key id) is how the AS picks the verifying key for your client assertion. Pin it per key and keep it stable across deploys.

## Key rotation

Pass *all* live keys in the `keyset` array. The library publishes every key in `jwks.json` but signs with the first one unless the AS's metadata pins a `kid`:

```ts
keyset: await Promise.all([
  JoseKey.fromImportable(currentPem, 'key-2026-q2'),     // signs new assertions
  JoseKey.fromImportable(previousPem, 'key-2026-q1'),    // still in jwks; used for in-flight verification if needed
])
```

Retention: keep the old key in `jwks` until the longest-lived refresh token issued under it has expired (180 days for confidential clients). Then remove it. The AS caches `jwks_uri`, typically for ≤1h.

## Browser (public SPA) — no server-side endpoints

`BrowserOAuthClient.load({ clientId, ... })` **fetches** the metadata from your `clientId` URL on first load. Someone still has to serve that file — usually your static host.

```json
// Served as /oauth-client-metadata.json by e.g. your SPA's static hosting.
{
  "client_id":                 "https://spa.example.com/oauth-client-metadata.json",
  "client_name":               "Example SPA",
  "client_uri":                "https://spa.example.com",
  "redirect_uris":             ["https://spa.example.com/oauth/callback"],
  "grant_types":               ["authorization_code", "refresh_token"],
  "response_types":            ["code"],
  "scope":                     "atproto transition:generic",
  "application_type":          "web",
  "token_endpoint_auth_method":"none",
  "dpop_bound_access_tokens":  true
}
```

No `jwks`, no `token_endpoint_auth_signing_alg`. Public clients are authenticated by DPoP proof alone.

If you're in a dev setup with `http://127.0.0.1`, the loopback-client shortcut applies — see `../shared/client-metadata.md` §loopback.

## Validating your metadata

Before pointing an AS at the URL, self-check:

```ts
import { validateClientMetadata } from '@atproto/oauth-client'
// (Internal helper; if not exported, run the CLI validator.)
validateClientMetadata(metadataObject)   // throws on invariants
```

Or use the repo-level `scripts/validate_client_metadata.py`. Run it in CI against the served URL — catches the mutations in `../shared/test-vectors.md` §V5.

## Serving correctly

- `Content-Type: application/json` (Express's `res.json()` handles this).
- `Cache-Control: public, max-age=300` is fine; don't cache for hours. ASes re-fetch aggressively.
- If behind CloudFront / Cloudflare, set a short TTL. After rotation you want the new `jwks` live within minutes.
- Serve over HTTPS. The AS will reject `http://` `client_id` URLs outside of loopback-dev mode.

## Public-client variant (Node native/desktop)

Rare but supported. Same shape as the Browser SPA metadata — `token_endpoint_auth_method: "none"`, no `jwks_uri`, redirect URIs with a custom scheme or `http://127.0.0.1`:

```json
{
  "client_id":                 "https://app.example.com/native-client-metadata.json",
  "application_type":          "native",
  "redirect_uris":             ["com.example.app:/oauth/callback"],
  "grant_types":               ["authorization_code", "refresh_token"],
  "response_types":            ["code"],
  "scope":                     "atproto transition:generic",
  "token_endpoint_auth_method":"none",
  "dpop_bound_access_tokens":  true
}
```

`@atproto/oauth-client-node` supports this by setting `token_endpoint_auth_method: 'none'` and omitting `keyset`. Refresh token lifetime drops to 14 days.

## Common pitfalls

- **Hand-rolling `jwks.json` from raw PEMs.** The private key components leak. Use `client.jwks`.
- **`client_id` URL path mismatch.** The AS fetches the exact URL you put in `client_id`. A trailing slash, path change, or `?format=` mutation breaks validation. Commit to one URL and serve it there.
- **Mixing `jwks` (inline) and `jwks_uri` in the same document.** Pick one. The library uses `jwks_uri` if `jwks_uri` is set.
- **Forgetting `dpop_bound_access_tokens: true`.** Required in the AT Proto profile. Without it the AS rejects the registration.
- **Static-hosted metadata + dynamic `client_id`.** Don't template the `client_id` per-env if your static host uses the same file. Either deploy per-env metadata files or thread env through the build.
- **Caching JWKS behind a CDN with a long TTL.** Rotations stall. Cap at 5 min during the rotation window.

## See also

- `README.md` — package setup, public API surface.
- `flows.md` — how `clientMetadata` is consumed by `authorize` / `callback`.
- `../shared/client-metadata.md` — normative rules.
- `../shared/test-vectors.md` §V5 — mutation tests for metadata.
- `../shared/security-requirements.md` §Client assertion keys — rotation semantics.
