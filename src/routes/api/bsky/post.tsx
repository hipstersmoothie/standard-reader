import { createFileRoute } from "@tanstack/react-router";
import { fetchPost } from "bsky-react-post/api";

export const Route = createFileRoute("/api/bsky/post")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const did = url.searchParams.get("did");
        const id = url.searchParams.get("id");
        const handle = url.searchParams.get("handle");

        if (!id) {
          return new Response(JSON.stringify({ error: "Bad Request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const target = handle ? { handle, id } : did ? { did, id } : null;

        if (!target) {
          return new Response(JSON.stringify({ error: "Bad Request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const post = await fetchPost(target);
          if (!post) {
            return new Response(JSON.stringify({ data: null }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ data: post }), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to fetch post";
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
