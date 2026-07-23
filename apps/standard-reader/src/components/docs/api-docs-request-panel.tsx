"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { Select, SelectItem } from "@standard-reader/design-system/select";
import { TextField } from "@standard-reader/design-system/text-field";
import { runApiDocsExample } from "#/integrations/tanstack-query/api-docs.functions";
import {
  buildApiDocsCurl,
  resolveApiDocsExampleParams,
} from "#/lib/api-docs/build-curl";
import type { ApiDocsCatalogEntry } from "#/lib/api-docs/catalog";
import type { ApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import { isPlaceholderApiDocsFixture } from "#/lib/api-docs/fixture-defaults";
import {
  apiDocsParamControls,
  apiDocsUsesSessionAuth,
} from "#/lib/api-docs/interactive-params";
import { mergeApiDocsExampleParams } from "#/lib/api-docs/merge-example-params";
import type { ApiDocsExampleResult } from "#/lib/api-docs/types";
import { getPublicUrlClient } from "#/lib/public-url";

import { useApiDocsPageContext } from "./api-docs-fixtures-context";
import { HighlightedCurl, HighlightedJson } from "./docs-highlighted-code";
import { docsStyles } from "./docs-page.stylex";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function initialControlValues(
  entry: ApiDocsCatalogEntry,
  fixtures: ApiDocsFixtures,
  signedIn: boolean,
): Record<string, string> {
  const controls = apiDocsParamControls(entry, signedIn);
  const exampleParams = resolveApiDocsExampleParams(entry, fixtures);
  const values: Record<string, string> = {};
  for (const control of controls) {
    const value = exampleParams[control.param];
    if (value) {
      values[control.param] = value;
    }
  }
  return values;
}

export const ApiDocsRequestPanel = memo(function RequestPanel({
  entry,
}: {
  entry: ApiDocsCatalogEntry;
}) {
  const { t } = useLingui();
  const { fixtures, tagOptions, signedIn, sessionDid } =
    useApiDocsPageContext();
  const controls = useMemo(
    () => apiDocsParamControls(entry, signedIn),
    [entry, signedIn],
  );

  const [paramValues, setParamValues] = useState(() =>
    initialControlValues(entry, fixtures, signedIn),
  );
  const [result, setResult] = useState<ApiDocsExampleResult | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setParamValues(initialControlValues(entry, fixtures, signedIn));
    setResult(undefined);
  }, [entry, fixtures, signedIn]);

  const effectiveParams = useMemo(() => {
    const merged = mergeApiDocsExampleParams(entry, fixtures, paramValues);
    if (signedIn && sessionDid && entry.auth === "optional-did") {
      merged.did = sessionDid;
    }
    return merged;
  }, [entry, fixtures, paramValues, signedIn, sessionDid]);

  const useSessionAuth = signedIn && apiDocsUsesSessionAuth(entry);

  const curl = useMemo(
    () =>
      buildApiDocsCurl(entry, getPublicUrlClient(), fixtures, {
        params: effectiveParams,
        bearerPlaceholder: useSessionAuth,
      }),
    [entry, fixtures, effectiveParams, useSessionAuth],
  );

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      runApiDocsExample({
        data: {
          nsid: entry.nsid,
          params: effectiveParams,
          useSessionAuth,
        },
      }),
    onSuccess: (data: ApiDocsExampleResult) => setResult(data),
  });

  const onCopy = useCallback(() => {
    void copyText(curl);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1400);
  }, [curl]);

  const onParamChange = useCallback((param: string, value: string) => {
    setParamValues((current) => ({ ...current, [param]: value }));
    setResult(undefined);
  }, []);

  const listBlocked =
    (entry.nsid === "app.standard-reader.getList" ||
      entry.nsid === "app.standard-reader.getListFeed") &&
    isPlaceholderApiDocsFixture(fixtures, "listUri");

  const canRun =
    (entry.example.autoRun && !listBlocked) ||
    (useSessionAuth && entry.auth === "required") ||
    (useSessionAuth && entry.method === "procedure");

  const ok = result != null && result.status >= 200 && result.status < 300;
  const durationMs = result?.durationMs ?? 0;
  const fetchedAt = result?.fetchedAt ?? "";

  return (
    <div {...stylex.props(docsStyles.reqPanel)}>
      <div {...stylex.props(docsStyles.reqBar)}>
        <span {...stylex.props(docsStyles.reqTag)}>curl</span>
        <span {...stylex.props(docsStyles.reqSpacer)} />
        <button
          type="button"
          {...stylex.props(docsStyles.reqBtn)}
          onClick={onCopy}
        >
          {copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
        </button>
        {canRun ? (
          <button
            type="button"
            disabled={isPending}
            {...stylex.props(
              docsStyles.reqBtn,
              docsStyles.reqBtnSolid,
              isPending && docsStyles.reqBtnDisabled,
            )}
            onClick={() => mutate()}
          >
            {isPending ? (
              <span {...stylex.props(docsStyles.spin)} aria-hidden />
            ) : (
              <Play size={11} fill="currentColor" strokeWidth={0} />
            )}
            {isPending ? (
              <Trans>Running</Trans>
            ) : result ? (
              <Trans>Re-run</Trans>
            ) : (
              <Trans>Run example</Trans>
            )}
          </button>
        ) : null}
      </div>

      {controls.length > 0 ? (
        <div {...stylex.props(docsStyles.reqParams)}>
          {controls.map((control) => {
            const label = control.label ?? control.param;
            if (control.kind === "select") {
              const options =
                control.optionsSource === "tags" ? tagOptions : [];
              const selectedKey = paramValues[control.param] ?? null;
              return (
                <div
                  key={control.param}
                  {...stylex.props(docsStyles.reqParamRow)}
                >
                  <span {...stylex.props(docsStyles.reqParamLabel)}>
                    {label}
                  </span>
                  <Select
                    aria-label={label}
                    isSearchable
                    items={options}
                    placeholder={t`Select a tag`}
                    selectedKey={selectedKey}
                    size="md"
                    style={docsStyles.reqParamControl}
                    variant="secondary"
                    onSelectionChange={(key) => {
                      if (key == null) {
                        return;
                      }
                      onParamChange(control.param, String(key));
                    }}
                  >
                    {(item) => (
                      <SelectItem id={item.id} textValue={item.label}>
                        {item.label}
                      </SelectItem>
                    )}
                  </Select>
                </div>
              );
            }

            return (
              <div
                key={control.param}
                {...stylex.props(docsStyles.reqParamRow)}
              >
                <span {...stylex.props(docsStyles.reqParamLabel)}>{label}</span>
                <TextField
                  aria-label={label}
                  placeholder={control.placeholder}
                  size="md"
                  style={docsStyles.reqParamControl}
                  value={paramValues[control.param] ?? ""}
                  variant="secondary"
                  onChange={(value) => onParamChange(control.param, value)}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <HighlightedCurl curl={curl} />

      <div {...stylex.props(docsStyles.respBar)}>
        <span {...stylex.props(docsStyles.reqTag)}>response</span>
        {result != null || isPending ? (
          <span
            {...stylex.props(
              ok || isPending
                ? docsStyles.respStatusOk
                : docsStyles.respStatusErr,
            )}
          >
            {isPending ? "· · ·" : `HTTP ${result?.status ?? ""}`}
          </span>
        ) : null}
      </div>

      {result != null || isPending ? (
        <p {...stylex.props(docsStyles.respMeta)} aria-live="polite">
          {isPending ? (
            <Trans>running…</Trans>
          ) : (
            <Trans>
              {durationMs}ms · fetched {fetchedAt}
            </Trans>
          )}
        </p>
      ) : null}

      {result == null ? (
        isPending ? null : (
          <p {...stylex.props(docsStyles.respEmpty)}>
            {entry.auth === "required" || entry.method === "procedure" ? (
              signedIn ? (
                <Trans>
                  Click Run example to fetch a live response with your session.
                </Trans>
              ) : (
                <Trans>
                  Sign in to run this example (curl uses Bearer $ACCESS_TOKEN).
                </Trans>
              )
            ) : listBlocked ? (
              <Trans>Set API_DOCS_FIXTURE_LIST_URI to run this example.</Trans>
            ) : (
              <Trans>Click Run example to fetch a live response.</Trans>
            )}
          </p>
        )
      ) : (
        <HighlightedJson json={result.bodyJson} pending={isPending} />
      )}
    </div>
  );
});
