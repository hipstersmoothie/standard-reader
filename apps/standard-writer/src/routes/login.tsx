import { Button } from "@standard-reader/design-system/button";
import { TextField } from "@standard-reader/design-system/text-field";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import {
  auth,
  savedHandlesQueryOptions,
} from "#/integrations/tanstack-query/api-auth.functions";
import type { SavedHandle } from "#/utils/saved-handles";
import { formatDisplayHandle, saveHandle } from "#/utils/saved-handles";
import { I, Ico } from "#/writer/icons";
import { NameAvatar } from "#/writer/name-avatar";
import { C } from "#/writer/tokens";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    error: z.string().optional(),
  }),
  // Already signed in? Skip the form.
  beforeLoad: async ({ search }) => {
    const session = await auth.getSession();
    if (session) {
      throw redirect({ to: search.redirect ?? "/dashboard" });
    }
  },
  component: LoginScreen,
});

function LoginScreen() {
  const { redirect: redirectTo, error } = Route.useSearch();
  const [handle, setHandle] = useState("");
  const [focused, setFocused] = useState(false);
  const { data: saved = [] } = useQuery(savedHandlesQueryOptions);

  const startWith = (raw: string) => {
    const h = raw.replace(/^@/, "").trim();
    if (!h) return;
    // Remember the handle for next time (avatar backfills after profile loads).
    saveHandle(h, saved.find((s) => s.handle === h)?.avatar ?? null);
    const params = new URLSearchParams({ handle: h });
    if (redirectTo) params.set("redirect", redirectTo);
    // Full navigation so the server-side authorize route runs the OAuth flow.
    globalThis.location.href = `/api/auth/atproto/authorize?${params.toString()}`;
  };

  // Filter saved handles by what's typed (blank shows the whole list).
  const suggestions = useMemo(() => {
    const q = handle.replace(/^@/, "").trim().toLowerCase();
    const matches = q
      ? saved.filter((s) => s.handle.toLowerCase().includes(q))
      : saved;
    // Hide when the only match is exactly what's typed already.
    if (matches.length === 1 && matches[0].handle.toLowerCase() === q) {
      return [];
    }
    return matches;
  }, [saved, handle]);

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          border: `1px solid ${C.b6}`,
          borderRadius: 16,
          background: C.warm,
          padding: 32,
        }}
      >
        <div
          style={{
            fontFamily: C.serif,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Standard <span style={{ color: C.a9 }}>Writer</span>
        </div>
        <p
          style={{
            margin: "0 0 24px",
            color: C.mut,
            fontSize: 14.5,
            lineHeight: 1.55,
          }}
        >
          Sign in with your Bluesky / AT Proto handle to compose and publish to
          the repo you own.
        </p>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background: C.sel5,
              color: C.a11,
              fontSize: 13,
            }}
          >
            Sign-in failed. Please try again.
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            startWith(handle);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ position: "relative" }}>
            <TextField
              aria-label="Handle"
              placeholder="you.bsky.social"
              prefix="@"
              value={handle}
              onChange={setHandle}
              onFocus={() => setFocused(true)}
              // Delay so a suggestion click registers before the list hides.
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              autoComplete="off"
              size="lg"
            />
            {showSuggestions && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: C.pageBg,
                  border: `1px solid ${C.b6}`,
                  borderRadius: 12,
                  boxShadow: "0 18px 44px -18px rgba(40,30,20,0.4)",
                  padding: 6,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {suggestions.map((s: SavedHandle) => (
                  <button
                    key={s.handle}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => startWith(s.handle)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      color: C.t12,
                    }}
                  >
                    <NameAvatar name={s.handle} src={s.avatar} size="sm" />
                    <span
                      style={{
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatDisplayHandle(s.handle)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="primary" size="lg" type="submit">
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Ico d={I.up} s={17} w={2} />
              Continue with Bluesky
            </span>
          </Button>
        </form>
      </div>
    </div>
  );
}
