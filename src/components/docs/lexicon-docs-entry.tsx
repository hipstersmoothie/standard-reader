"use client";

import type { LexiconDocsEntry } from "#/lib/lexicon-docs/types";

import * as stylex from "@stylexjs/stylex";
import {
  lexiconDocsEntryId,
  lexiconDocsNsidLeaf,
  lexiconDocsNsidPrefix,
} from "#/lib/lexicon-docs/navigation";
import { useCallback, useState } from "react";

import { HighlightedJson } from "./docs-highlighted-code";
import { docsStyles } from "./docs-page.stylex";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

export function LexiconDocsJsonPanel({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    void copyText(json);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1400);
  }, [json]);

  return (
    <div {...stylex.props(docsStyles.reqPanel)}>
      <div {...stylex.props(docsStyles.reqBar)}>
        <span {...stylex.props(docsStyles.reqTag)}>schema</span>
        <span {...stylex.props(docsStyles.reqSpacer)} />
        <button
          type="button"
          {...stylex.props(docsStyles.reqBtn)}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <HighlightedJson json={json} />
    </div>
  );
}

const TYPE_BADGE: Record<LexiconDocsEntry["primaryType"], stylex.StyleXStyles> =
  {
    query: docsStyles.methodBadgeQuery,
    procedure: docsStyles.methodBadgeProcedure,
    record: docsStyles.lexiconBadgeRecord,
    defs: docsStyles.lexiconBadgeDefs,
  };

const FIELDS_HEADING: Record<LexiconDocsEntry["primaryType"], string> = {
  query: "Parameters",
  procedure: "Input",
  record: "Fields",
  defs: "Definitions",
};

export function LexiconDocsEntrySection({
  entry,
  first,
}: {
  entry: LexiconDocsEntry;
  first?: boolean;
}) {
  return (
    <section
      id={lexiconDocsEntryId(entry.id)}
      {...stylex.props(docsStyles.endpoint, first && docsStyles.endpointFirst)}
    >
      <div {...stylex.props(docsStyles.endpointGrid)}>
        <div {...stylex.props(docsStyles.endpointLeft)}>
          <div {...stylex.props(docsStyles.nsidRow)}>
            <span>
              <span {...stylex.props(docsStyles.nsidDim)}>
                {lexiconDocsNsidPrefix(entry.id)}
              </span>
              {lexiconDocsNsidLeaf(entry.id)}
            </span>
            <span
              {...stylex.props(
                docsStyles.methodBadge,
                TYPE_BADGE[entry.primaryType],
              )}
            >
              {entry.primaryType}
            </span>
            {entry.recordKey ? (
              <span {...stylex.props(docsStyles.authBadge)}>
                key: {entry.recordKey}
              </span>
            ) : null}
          </div>
          {entry.description ? (
            <p {...stylex.props(docsStyles.endpointDesc)}>
              {entry.description}
            </p>
          ) : null}
          {entry.fields.length > 0 ? (
            <>
              <p {...stylex.props(docsStyles.lexiconFieldsLabel)}>
                {FIELDS_HEADING[entry.primaryType]}
              </p>
              <table {...stylex.props(docsStyles.paramTable)}>
                <thead>
                  <tr>
                    <th {...stylex.props(docsStyles.paramTh)}>Name</th>
                    <th {...stylex.props(docsStyles.paramTh)}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.fields.map((field) => (
                    <tr key={field.name}>
                      <td {...stylex.props(docsStyles.paramTd)}>
                        <span {...stylex.props(docsStyles.paramName)}>
                          {field.name}
                          {field.required ? (
                            <span {...stylex.props(docsStyles.paramRequired)}>
                              *
                            </span>
                          ) : null}
                        </span>
                        {field.description ? (
                          <span {...stylex.props(docsStyles.lexiconFieldDesc)}>
                            {field.description}
                          </span>
                        ) : null}
                      </td>
                      <td {...stylex.props(docsStyles.paramTd)}>
                        <span {...stylex.props(docsStyles.paramType)}>
                          {field.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
        <div {...stylex.props(docsStyles.endpointRight)}>
          <LexiconDocsJsonPanel json={entry.json} />
        </div>
      </div>
    </section>
  );
}
