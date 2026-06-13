"use client";

import * as stylex from "@stylexjs/stylex";
import {
  APPVIEW_SERVICE_ID,
  appviewDidClient,
  xrpcBaseUrlClient,
} from "#/lib/api-docs/discovery";
import { API_DOCS_INTRO_IDS } from "#/lib/api-docs/navigation";

import { docsStyles } from "./docs-page.stylex";

export function ApiDocsIntro() {
  return (
    <>
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>Developer docs</div>
        <h1 {...stylex.props(docsStyles.title)}>AppView API</h1>
        <p {...stylex.props(docsStyles.dek)}>
          Public XRPC queries and procedures for the Standard Reader indexed
          read-model.
        </p>
        <div {...stylex.props(docsStyles.baseUrl)}>
          <span {...stylex.props(docsStyles.baseUrlLabel)}>Base</span>
          <span>{xrpcBaseUrlClient()}</span>
          <span {...stylex.props(docsStyles.baseUrlDot)}>·</span>
          <span {...stylex.props(docsStyles.baseUrlOk)}>
            <span {...stylex.props(docsStyles.baseUrlOkDot)} aria-hidden />
            operational
          </span>
        </div>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          id={API_DOCS_INTRO_IDS.overview}
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        >
          Overview
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          Standard Reader exposes an AT Proto AppView at{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            {xrpcBaseUrlClient()}
          </code>
          . Public directory and feed queries read the Neon index; personal
          state lives in each reader&apos;s PDS as{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.standard-reader.*
          </code>{" "}
          repo records.
        </p>

        <h2 id={API_DOCS_INTRO_IDS.discovery} {...stylex.props(docsStyles.h2)}>
          Service discovery
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          Service DID is{" "}
          <code
            {...stylex.props(
              docsStyles.codeInline,
              docsStyles.codeInlineAccent,
            )}
          >
            {appviewDidClient()}
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
        </p>

        <h2 id={API_DOCS_INTRO_IDS.auth} {...stylex.props(docsStyles.h2)}>
          Authentication
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          Public reads need no token. Authenticated reads and writes accept
          standard AT Proto credentials: call your PDS with{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            atproto-proxy: {appviewDidClient()}#{APPVIEW_SERVICE_ID}
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
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          Reader state endpoints also accept an optional{" "}
          <code {...stylex.props(docsStyles.codeInline)}>did</code> query param
          to read a reader&apos;s public indexed state without auth.
        </p>
      </div>
    </>
  );
}
