/**
 * Package the production firefox-mv2 build for AMO upload.
 *
 * `wxt zip` hangs after archiving because StyleX leaves async handles open;
 * we build with `wxt build -b firefox` then zip here and exit cleanly.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(extensionDir, "package.json"), "utf8"),
);
const buildDir = join(extensionDir, ".output", "firefox-mv2");
const zipPath = join(
  extensionDir,
  ".output",
  `standard-reader-extension-${version}-firefox.zip`,
);

const result = spawnSync("zip", ["-r", zipPath, "."], {
  cwd: buildDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error(`zip failed with exit code ${result.status ?? 1}`);
}

console.log(`Wrote ${zipPath}`);
