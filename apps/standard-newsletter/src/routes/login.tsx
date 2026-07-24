import { createFileRoute } from "@tanstack/react-router";

import { C, NEG, NEG_BG, NEG_BORDER } from "../theme";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: Login,
});

function Login() {
  const { error, redirect } = Route.useSearch();
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
        padding: 24,
      }}
    >
      <form
        method="get"
        action="/api/auth/atproto/authorize"
        style={{
          width: "100%",
          maxWidth: 400,
          background: C.warm,
          border: `1px solid ${C.b6}`,
          borderRadius: 16,
          padding: "36px 32px",
        }}
      >
        <div
          style={{
            fontFamily: C.serif,
            fontSize: "1.3rem",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            marginBottom: 24,
          }}
        >
          Standard <span style={{ color: C.a9 }}>Newsletter</span>
        </div>
        <h1
          style={{
            fontFamily: C.serif,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: C.mut, margin: "0 0 24px" }}>
          Use your AT Protocol handle to continue.
        </p>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: NEG,
              background: NEG_BG,
              border: `1px solid ${NEG_BORDER}`,
              borderRadius: 10,
              padding: "9px 12px",
              marginBottom: 16,
            }}
          >
            Sign-in didn’t complete. Please try again.
          </div>
        )}

        <label
          htmlFor="handle"
          style={{
            display: "block",
            fontSize: 12.5,
            color: C.mut,
            marginBottom: 6,
          }}
        >
          Handle
        </label>
        <input
          id="handle"
          name="handle"
          required
          autoComplete="username"
          placeholder="you.bsky.social"
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: C.mono,
            fontSize: 14,
            padding: "11px 13px",
            borderRadius: 10,
            border: `1px solid ${C.b7}`,
            background: C.pageBg,
            color: C.t12,
            marginBottom: 18,
          }}
        />
        {redirect && <input type="hidden" name="redirect" value={redirect} />}

        <button
          type="submit"
          style={{
            width: "100%",
            fontFamily: C.sans,
            fontSize: 15,
            fontWeight: 600,
            color: C.onAccent,
            background: C.a9,
            border: "none",
            borderRadius: 10,
            padding: "12px 16px",
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
