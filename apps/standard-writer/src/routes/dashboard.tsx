import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { auth } from "../integrations/tanstack-query/api-auth.functions";
import { WriterApp } from "../writer/writer-app";

export const Route = createFileRoute("/dashboard")({
  // The app is auth-only: guests are sent to sign in and returned here after.
  beforeLoad: async () => {
    const session = await auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: "/dashboard" } });
    }
  },
  component: Dashboard,
});

function Dashboard() {
  // The composing surface (Lexical + a body portal) is client-only, so mount the
  // app after hydration rather than server-rendering the editor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <WriterApp />;
}
