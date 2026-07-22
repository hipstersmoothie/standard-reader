import { Button } from "@standard-reader/design-system/button";
import { TextField } from "@standard-reader/design-system/text-field";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { I, Ico } from "#/writer/icons";
import { C } from "#/writer/tokens";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    error: z.string().optional(),
  }),
  component: LoginScreen,
});

function LoginScreen() {
  const { redirect, error } = Route.useSearch();
  const [handle, setHandle] = useState("");

  const start = () => {
    const h = handle.replace(/^@/, "").trim();
    if (!h) return;
    const params = new URLSearchParams({ handle: h });
    if (redirect) params.set("redirect", redirect);
    // Full navigation so the server-side authorize route runs the OAuth flow.
    globalThis.location.href = `/api/auth/atproto/authorize?${params.toString()}`;
  };

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
            start();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <TextField
            aria-label="Handle"
            placeholder="you.bsky.social"
            prefix="@"
            value={handle}
            onChange={setHandle}
            size="lg"
          />
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
