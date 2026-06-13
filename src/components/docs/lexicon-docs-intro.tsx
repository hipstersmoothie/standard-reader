"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { LEXICON_DOCS_INTRO_IDS } from "#/lib/lexicon-docs/navigation";

import { docsStyles } from "./docs-page.stylex";

export function LexiconDocsIntro() {
  return (
    <>
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>Developer docs</div>
        <h1 {...stylex.props(docsStyles.title)}>Lexicons</h1>
        <p {...stylex.props(docsStyles.dek)}>
          Published AT Proto record schemas for reader state in each user&apos;s
          PDS.
        </p>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          id={LEXICON_DOCS_INTRO_IDS.overview}
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        >
          Overview
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          Standard Reader owns the{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.standard-reader.*
          </code>{" "}
          namespace. These lexicons describe repo records — bookmarks, read
          state, lists, and related shared definitions. AppView XRPC queries and
          procedures are documented on{" "}
          <Link to="/docs/api" {...stylex.props(docsStyles.proseLink)}>
            /docs/api
          </Link>
          .
        </p>

        <h2
          id={LEXICON_DOCS_INTRO_IDS.namespace}
          {...stylex.props(docsStyles.h2)}
        >
          Namespace
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          Authority for{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.standard-reader
          </code>{" "}
          resolves via DNS{" "}
          <code {...stylex.props(docsStyles.codeInline)}>_lexicon.*</code> TXT
          records to the publishing account.
        </p>
      </div>
    </>
  );
}
