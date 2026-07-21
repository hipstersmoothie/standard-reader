"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import {
  APPVIEW_SERVICE_ID,
  appviewDidClient,
  xrpcBaseUrlClient,
} from "#/lib/api-docs/discovery";
import { API_DOCS_INTRO_IDS } from "#/lib/api-docs/navigation";

import { docsStyles } from "./docs-page.stylex";

export function ApiDocsIntro() {
  const xrpcBaseUrl = xrpcBaseUrlClient();
  const appviewDid = appviewDidClient();

  return (
    <>
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>
          <Trans>Developer docs</Trans>
        </div>
        <h1 {...stylex.props(docsStyles.title)}>
          <Trans>AppView API</Trans>
        </h1>
        <p {...stylex.props(docsStyles.dek)}>
          <Trans>
            Public XRPC queries and procedures for the Standard Reader indexed
            read-model.
          </Trans>
        </p>
        <div {...stylex.props(docsStyles.baseUrl)}>
          <span {...stylex.props(docsStyles.baseUrlLabel)}>
            <Trans>Base</Trans>
          </span>
          <span>{xrpcBaseUrl}</span>
          <span {...stylex.props(docsStyles.baseUrlDot)}>·</span>
          <span {...stylex.props(docsStyles.baseUrlOk)}>
            <span {...stylex.props(docsStyles.baseUrlOkDot)} aria-hidden />
            <Trans>operational</Trans>
          </span>
        </div>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          id={API_DOCS_INTRO_IDS.overview}
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        >
          <Trans>Overview</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Standard Reader exposes an AT Proto AppView at{" "}
            <code {...stylex.props(docsStyles.codeInline)}>{xrpcBaseUrl}</code>.
            Public directory and feed queries read the Neon index; personal
            state lives in each reader&apos;s PDS as{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              app.standard-reader.*
            </code>{" "}
            repo records.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Prefer a typed client? The whole API ships as codegen&apos;d AT
            Protocol lexicon schemas in{" "}
            <a
              href="https://www.npmjs.com/package/@standard-reader/lexicons"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              @standard-reader/lexicons
            </a>
            . Pair it with{" "}
            <a
              href="https://www.npmjs.com/package/@atproto/lex-client"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              @atproto/lex-client
            </a>{" "}
            for fully-typed{" "}
            <code {...stylex.props(docsStyles.codeInline)}>client.call()</code>{" "}
            queries and procedures. Its{" "}
            <code {...stylex.props(docsStyles.codeInline)}>getDocument</code>{" "}
            also returns a document&apos;s renderable body, ready to hand to the{" "}
            <a href="/docs/renderers" {...stylex.props(docsStyles.proseLink)}>
              renderers
            </a>
            .
          </Trans>
        </p>

        <h2 id={API_DOCS_INTRO_IDS.discovery} {...stylex.props(docsStyles.h2)}>
          <Trans>Service discovery</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Service DID is{" "}
            <code
              {...stylex.props(
                docsStyles.codeInline,
                docsStyles.codeInlineAccent,
              )}
            >
              {appviewDid}
            </code>
            . The service advertises a{" "}
            <a
              href="/.well-known/did.json"
              {...stylex.props(docsStyles.proseLink)}
            >
              DID document
            </a>{" "}
            and an{" "}
            <a
              href="/.well-known/oauth-protected-resource.json"
              {...stylex.props(docsStyles.proseLink)}
            >
              OAuth protected resource
            </a>{" "}
            descriptor for clients that negotiate scopes.
          </Trans>
        </p>

        <h2 id={API_DOCS_INTRO_IDS.auth} {...stylex.props(docsStyles.h2)}>
          <Trans>Authentication</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Public reads need no token. Authenticated reads and writes accept
            standard AT Proto credentials: call your PDS with{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              atproto-proxy: {appviewDid}#{APPVIEW_SERVICE_ID}
            </code>{" "}
            (recommended), or call the AppView directly with{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              Authorization: DPoP
            </code>{" "}
            plus a DPoP proof. Token validity is checked via{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.server.getSession
            </code>{" "}
            on the issuer PDS.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Reader state endpoints also accept an optional{" "}
            <code {...stylex.props(docsStyles.codeInline)}>did</code> query
            param to read a reader&apos;s public indexed state without auth.
          </Trans>
        </p>

        <h2 id={API_DOCS_INTRO_IDS.labelers} {...stylex.props(docsStyles.h2)}>
          <Trans>Run a labeler</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            A labeler is any DID that publishes AT Proto labels. Readers add one
            by DID on the{" "}
            <a href="/labelers" {...stylex.props(docsStyles.proseLink)}>
              Labelers
            </a>{" "}
            page, and Standard Reader then shows that labeler&apos;s labels —
            and can warn on or hide labeled posts — as they read. Labelers are
            discovered the standard way; nothing about them is specific to us.
            To run your own:
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>1. Identity &amp; signing key.</strong> Give it a DID (a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>did:web</code> is
            simplest) whose DID document advertises an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              #atproto_labeler
            </code>{" "}
            service endpoint and an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>#atproto_label</code>{" "}
            public signing key.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>2. Serve labels.</strong> Sign and emit{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.defs#label
            </code>{" "}
            objects, and expose the standard{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.queryLabels
            </code>{" "}
            (HTTP) and{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.subscribeLabels
            </code>{" "}
            (WebSocket) endpoints.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>3. Declare your label values.</strong> Describe each value
            (severity, default warn/hide, blur behavior) in an{" "}
            <a
              href="/docs/lexicons#lex-service"
              {...stylex.props(docsStyles.proseLink)}
            >
              app.standard-reader.labeler.service
            </a>{" "}
            descriptor, served from{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              app.standard-reader.labeler.getServices
            </code>{" "}
            (a <code {...stylex.props(docsStyles.codeInline)}>did:web</code>{" "}
            labeler has no repo to hold the record).
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>4. Let readers subscribe.</strong> When a reader subscribes
            we write an{" "}
            <a
              href="/docs/lexicons#lex-labeler.subscription"
              {...stylex.props(docsStyles.proseLink)}
            >
              app.standard-reader.labeler.subscription
            </a>{" "}
            record to their repo, carrying their per-label warn/hide
            preferences.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            For a complete, minimal reference implementation (Jetstream → detect
            → sign → SQLite → serve), see the{" "}
            <code {...stylex.props(docsStyles.codeInline)}>claudeslop</code>{" "}
            labeler in{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              services/claudeslop
            </code>
            .
          </Trans>
        </p>
      </div>
    </>
  );
}
