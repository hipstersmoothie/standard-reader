import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WriterApp } from "../writer/writer-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  // The composing surface (Lexical + a body portal) is client-only, so mount the
  // app after hydration rather than server-rendering the editor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <WriterApp />;
}
