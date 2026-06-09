"use client";

import type { LeafletPollBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { articleBodyStyles } from "../body-styles";

interface LeafletPollDefinition {
  name?: string;
  options?: Array<{ text?: string }>;
}

function parseAtUri(uri: string): {
  did: string;
  collection: string;
  rkey: string;
} | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  return {
    did,
    collection: after.slice(0, nextSlash),
    rkey: after.slice(nextSlash + 1),
  };
}

async function fetchPollDefinition(
  pollUri: string,
): Promise<LeafletPollDefinition | null> {
  const parsed = parseAtUri(pollUri);
  if (!parsed) return null;

  const doc = await fetch(
    `https://plc.directory/${encodeURIComponent(parsed.did)}`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const pds = doc?.service?.find(
    (service: { id?: string; serviceEndpoint?: string }) =>
      service.id === "#atproto_pds",
  )?.serviceEndpoint;
  if (typeof pds !== "string") return null;

  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const record = await fetch(
    `${pds.replace(/\/+$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!record?.value || typeof record.value !== "object") return null;
  return record.value as LeafletPollDefinition;
}

export function LeafletPollBlockView({ block }: { block: LeafletPollBlock }) {
  const pollUri = block.pollRef?.uri?.trim();
  const { data: poll, isPending } = useQuery({
    queryKey: ["leaflet-poll", pollUri] as const,
    queryFn: async () => {
      if (!pollUri) return null;
      return fetchPollDefinition(pollUri);
    },
    enabled: Boolean(pollUri),
    staleTime: 5 * 60 * 1000,
  });

  if (!pollUri) return null;

  const title = poll?.name?.trim() || "Poll";
  const options = (poll?.options ?? [])
    .map((option) => option.text?.trim())
    .filter(Boolean);

  return (
    <div {...stylex.props(articleBodyStyles.pollCard)}>
      <p {...stylex.props(articleBodyStyles.pollTitle)}>{title}</p>
      {isPending && options.length === 0 ? (
        <p {...stylex.props(articleBodyStyles.pollOption)}>Loading poll…</p>
      ) : null}
      <ul {...stylex.props(articleBodyStyles.pollOptions)}>
        {options.map((option, index) => (
          <li key={index} {...stylex.props(articleBodyStyles.pollOption)}>
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}
