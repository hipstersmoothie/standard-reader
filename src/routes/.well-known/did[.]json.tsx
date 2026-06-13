import { createFileRoute } from "@tanstack/react-router";
import {
  APPVIEW_SERVICE_ID,
  appviewDid,
  xrpcBaseUrl,
} from "#/server/xrpc/config";

export const Route = createFileRoute("/.well-known/did.json")({
  server: {
    handlers: {
      GET: () => {
        const did = appviewDid();
        const body = {
          "@context": ["https://www.w3.org/ns/did/v1"],
          id: did,
          service: [
            {
              id: `#${APPVIEW_SERVICE_ID}`,
              type: "StandardReaderAppView",
              serviceEndpoint: xrpcBaseUrl(),
            },
          ],
        };
        return new Response(JSON.stringify(body), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
