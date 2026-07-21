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
            queries and procedures.
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
      </div>
    </>
  );
}
