"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import type { LeafletPollBlock } from "#/lib/leaflet/types";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";

import { articleBodyStyles } from "../body-styles";
interface LeafletPollDefinition {
  name?: string;
  options?: Array<{ text?: string }>;
}

async function fetchPollDefinition(
  pollUri: string,
): Promise<LeafletPollDefinition | null> {
  const result = await fetchRepoRecordWithFallback(pollUri);
  if (!result?.value || typeof result.value !== "object") return null;
  return result.value as LeafletPollDefinition;
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
