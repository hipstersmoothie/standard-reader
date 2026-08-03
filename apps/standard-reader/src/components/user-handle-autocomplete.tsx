"use client";

import { AutocompleteInput } from "@standard-reader/design-system/autocomplete";
import { Avatar } from "@standard-reader/design-system/avatar";
import { ListBoxItem } from "@standard-reader/design-system/listbox";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

type HandleActor = {
  id: string;
  did: string;
  handle: string;
  avatar: string | null;
};

export interface UserHandleAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the selected handle and, when available, the actor's DID.
   * The DID lets callers (e.g. the authorize flow) look up the user's
   * collections-authoring flag without an extra handle→DID resolution. */
  onSelect?: (handle: string, did?: string) => void;
  label?: React.ReactNode;
  "aria-label"?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
}

const styles = stylex.create({
  itemHandle: {
    minWidth: 0,
  },
});

/** Shared Bluesky handle autocomplete (app.bsky.actor.searchActorsTypeahead). */
export function UserHandleAutocomplete({
  value,
  onValueChange,
  onSelect,
  label,
  "aria-label": ariaLabel,
  placeholder = "your.handle.com",
  size = "lg",
}: UserHandleAutocompleteProps) {
  const query = value.trim();
  const isSearching = query.length >= 2;

  const { data: actorsData } = useQuery<{
    actors: Array<{ did: string; handle: string; avatar: string | null }>;
  }>({
    queryKey: ["bsky-handle-typeahead", query],
    queryFn: async () => {
      // Community-hosted actor typeahead (drop-in compatible with the bsky
      // XRPC — same response shape, includes `did` so callers can avoid a
      // separate handle→DID resolution).
      const host = "https://typeahead.waow.tech";
      const url = new URL("xrpc/app.bsky.actor.searchActorsTypeahead", host);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "5");

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch actors");
      }
      return res.json() as Promise<{
        actors: Array<{ did: string; handle: string; avatar: string | null }>;
      }>;
    },
    enabled: isSearching,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const actors: Array<HandleActor> = (actorsData?.actors ?? []).map(
    (actor) => ({
      ...actor,
      id: actor.handle,
    }),
  );

  // Map handle → did so onAction (which only gives us the ListBoxItem id,
  // i.e. the handle) can resolve the DID without re-scanning the actors array.
  const didByHandle = new Map(actors.map((a) => [a.handle, a.did]));

  const select = (handle: string) => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (trimmed === "") return;
    onValueChange(trimmed);
    onSelect?.(trimmed, didByHandle.get(trimmed));
  };

  return (
    <AutocompleteInput
      size={size}
      placeholder={placeholder}
      // This is a handle field with its own in-app suggestion list, never a
      // password/username login field. `autoComplete="off"` handles the native
      // browser, and `disablePasswordManagers` adds the vendor ignore
      // attributes (1Password, etc.) that extensions honor instead — so neither
      // pops autofill over our dropdown.
      autoComplete="off"
      disablePasswordManagers
      label={label}
      aria-label={ariaLabel}
      inputValue={value}
      onInputChange={onValueChange}
      items={actors}
      onAction={select}
      onEnter={(rawValue) => {
        const typed = rawValue.trim().replace(/^@/, "");
        // Every atproto handle has at least one dot, so a dotted value is what
        // the user meant to sign in as — never override it with a suggestion.
        // Otherwise take the top suggestion, which is the option they're
        // looking at while a partial handle is typed.
        select(typed.includes(".") ? typed : (actors[0]?.handle ?? typed));
      }}
    >
      {(actor) => (
        <ListBoxItem
          key={actor.handle}
          textValue={actor.handle}
          id={actor.handle}
          prefix={
            <Avatar
              src={actor.avatar ?? undefined}
              alt={actor.handle}
              fallback={actor.handle[0]?.toUpperCase() ?? "?"}
              size="md"
            />
          }
        >
          <span {...stylex.props(styles.itemHandle)}>{actor.handle}</span>
        </ListBoxItem>
      )}
    </AutocompleteInput>
  );
}
