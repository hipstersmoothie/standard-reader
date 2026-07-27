"use client";

import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";

import type {
  CurlTokenType,
  HtmlTokenType,
  JsonTokenType,
} from "#/lib/api-docs/syntax-highlight";
import {
  tokenizeCurl,
  tokenizeHtml,
  tokenizeJson,
} from "#/lib/api-docs/syntax-highlight";

import { docsStyles } from "./docs-page.stylex";

const jsonStyles: Record<JsonTokenType, stylex.StyleXStyles | null> = {
  key: docsStyles.jsonKey,
  str: docsStyles.jsonStr,
  num: docsStyles.jsonNum,
  bool: docsStyles.jsonBool,
  null: docsStyles.jsonNull,
  plain: null,
};

const curlStyles: Record<CurlTokenType, stylex.StyleXStyles | null> = {
  flag: docsStyles.reqCodeFlag,
  url: docsStyles.reqCodeUrl,
  plain: null,
};

const htmlStyles: Record<HtmlTokenType, stylex.StyleXStyles | null> = {
  tag: docsStyles.jsonKey,
  attr: docsStyles.reqCodeFlag,
  str: docsStyles.jsonStr,
  plain: null,
};

export function HighlightedCurl({ curl }: { curl: string }) {
  const tokens = useMemo(() => tokenizeCurl(curl), [curl]);

  return (
    <pre {...stylex.props(docsStyles.reqCode)}>
      {tokens.map((token, index) => {
        const style = curlStyles[token.type];
        if (style == null) {
          return <span key={index}>{token.text}</span>;
        }
        return (
          <span key={index} {...stylex.props(style)}>
            {token.text}
          </span>
        );
      })}
    </pre>
  );
}

export function HighlightedHtml({ html }: { html: string }) {
  const tokens = useMemo(() => tokenizeHtml(html), [html]);

  return (
    <pre {...stylex.props(docsStyles.reqCode)}>
      {tokens.map((token, index) => {
        const style = htmlStyles[token.type];
        if (style == null) {
          return <span key={index}>{token.text}</span>;
        }
        return (
          <span key={index} {...stylex.props(style)}>
            {token.text}
          </span>
        );
      })}
    </pre>
  );
}

export function HighlightedJson({
  json,
  pending,
}: {
  json: string;
  pending?: boolean;
}) {
  const tokens = useMemo(() => tokenizeJson(json), [json]);

  return (
    <pre
      {...stylex.props(
        docsStyles.respJson,
        pending && docsStyles.respJsonPending,
      )}
    >
      {tokens.map((token, index) => {
        const style = jsonStyles[token.type];
        if (style == null) {
          return <span key={index}>{token.text}</span>;
        }
        return (
          <span key={index} {...stylex.props(style)}>
            {token.text}
          </span>
        );
      })}
    </pre>
  );
}
