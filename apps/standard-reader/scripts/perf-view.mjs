/**
 * Serve the perf regression viewer and JSON results locally.
 *
 *   pnpm perf:view
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const perfDir = path.join(__dirname, "..", "perf");
const port = Number(process.env.PERF_VIEW_PORT ?? 3098);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function listRuns() {
  const resultsDir = path.join(perfDir, "results");
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .toReversed();
}

function safePath(urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const resolved = path.resolve(perfDir, relative);
  if (!resolved.startsWith(perfDir)) return null;
  return resolved;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/api/runs") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(listRuns()));
    return;
  }

  let filePath;
  if (url.pathname === "/" || url.pathname === "/viewer.html") {
    filePath = path.join(perfDir, "viewer.html");
  } else {
    filePath = safePath(url.pathname);
  }

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  // eslint-disable-next-line no-console
  console.log(`Perf viewer at ${url}`);
  // eslint-disable-next-line no-console
  console.log(`Latest comparison: ${url}/results/latest-comparison.json`);
});
