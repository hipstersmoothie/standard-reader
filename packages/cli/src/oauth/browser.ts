/**
 * Opening the user's browser, without a dependency for it.
 *
 * Best-effort by design: a headless box, an SSH session, or a locked-down
 * desktop may have nothing to open. The caller always prints the URL too, so a
 * failure here costs a copy-paste rather than the whole flow.
 */

import { spawn } from "node:child_process";

function opener(): { command: string; args: Array<string> } {
  switch (process.platform) {
    case "darwin": {
      return { args: [], command: "open" };
    }
    case "win32": {
      // `start` is a shell builtin, and its first quoted argument is the window
      // title — hence the empty string before the URL.
      return { args: ["/c", "start", ""], command: "cmd" };
    }
    default: {
      return { args: [], command: "xdg-open" };
    }
  }
}

/** Try to open `url` in the default browser. Resolves false if it could not. */
export async function openBrowser(url: string): Promise<boolean> {
  const { command, args } = opener();
  return new Promise((resolve) => {
    try {
      const child = spawn(command, [...args, url], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => resolve(false));
      // Do not hold the event loop open waiting for the browser to exit.
      child.unref();
      setTimeout(() => resolve(true), 100);
    } catch {
      resolve(false);
    }
  });
}
