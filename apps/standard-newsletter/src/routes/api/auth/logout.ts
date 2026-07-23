import { createFileRoute } from "@tanstack/react-router";

async function doLogout(request: Request): Promise<Response> {
  const [{ logout }, { AUTH_SESSION_TOKEN_COOKIE }] = await Promise.all([
    import("#/integrations/auth/session.server"),
    import("#/integrations/auth/constants"),
  ]);
  await logout(request);
  const url = new URL(request.url);
  const headers = new Headers();
  headers.set("Location", new URL("/", url.origin).toString());
  headers.append(
    "Set-Cookie",
    `${AUTH_SESSION_TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return new Response(null, { status: 302, headers });
}

/** Clears the app session and returns to the marketing home. */
export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      GET: ({ request }) => doLogout(request),
      POST: ({ request }) => doLogout(request),
    },
  },
});
