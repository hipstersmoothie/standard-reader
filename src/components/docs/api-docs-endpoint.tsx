"use client";

import type { ApiDocsCatalogEntry } from "#/lib/api-docs/catalog";

import * as stylex from "@stylexjs/stylex";
import {
  apiDocsAuthLabel,
  apiDocsEndpointId,
  apiDocsNsidLeaf,
  apiDocsNsidPrefix,
} from "#/lib/api-docs/navigation";

import { ApiDocsRequestPanel } from "./api-docs-request-panel";
import { docsStyles } from "./docs-page.stylex";

export function ApiDocsEndpoint({
  entry,
  first,
}: {
  entry: ApiDocsCatalogEntry;
  first?: boolean;
}) {
  const authRequired = entry.auth !== "none";

  return (
    <section
      id={apiDocsEndpointId(entry.nsid)}
      {...stylex.props(docsStyles.endpoint, first && docsStyles.endpointFirst)}
    >
      <div {...stylex.props(docsStyles.endpointGrid)}>
        <div {...stylex.props(docsStyles.endpointLeft)}>
          <div {...stylex.props(docsStyles.nsidRow)}>
            <span>
              <span {...stylex.props(docsStyles.nsidDim)}>
                {apiDocsNsidPrefix(entry.nsid)}
              </span>
              <span>{apiDocsNsidLeaf(entry.nsid)}</span>
            </span>
            <span
              {...stylex.props(
                docsStyles.methodBadge,
                entry.method === "query"
                  ? docsStyles.methodBadgeQuery
                  : docsStyles.methodBadgeProcedure,
              )}
            >
              {entry.method}
            </span>
            <span {...stylex.props(docsStyles.authBadge)}>
              <span
                {...stylex.props(
                  docsStyles.authDot,
                  authRequired && docsStyles.authDotRequired,
                )}
              />
              auth: {apiDocsAuthLabel(entry.auth)}
            </span>
          </div>
          <p {...stylex.props(docsStyles.endpointDesc)}>{entry.description}</p>
          {entry.params.length > 0 ? (
            <table {...stylex.props(docsStyles.paramTable)}>
              <thead>
                <tr>
                  <th {...stylex.props(docsStyles.paramTh)}>Param</th>
                  <th {...stylex.props(docsStyles.paramTh)}>Type</th>
                </tr>
              </thead>
              <tbody>
                {entry.params.map((param) => (
                  <tr key={param.name}>
                    <td {...stylex.props(docsStyles.paramTd)}>
                      <span {...stylex.props(docsStyles.paramName)}>
                        {param.name}
                        {param.required ? (
                          <span {...stylex.props(docsStyles.paramRequired)}>
                            *
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td {...stylex.props(docsStyles.paramTd)}>
                      <span {...stylex.props(docsStyles.paramType)}>
                        {param.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <div {...stylex.props(docsStyles.endpointRight)}>
          <ApiDocsRequestPanel entry={entry} />
        </div>
      </div>
    </section>
  );
}
