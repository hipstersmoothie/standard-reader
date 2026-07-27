/** Command dispatch, kept out of `bin.ts` so it can be exercised in tests. */

import { ArgError, parseArgs } from "./args.js";
import { CliError, describeError } from "./atproto.js";
import { runConvert } from "./commands/convert.js";
import { runFormats } from "./commands/formats.js";
import { runList } from "./commands/list.js";
import { HELP } from "./help.js";
import { say, style, warn } from "./output.js";

export async function runCli(argv: Array<string>): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    warn(style.red(describeError(error)));
    return 2;
  }

  if (
    args.flags.has("help") ||
    args.command === null ||
    args.command === "help"
  ) {
    say(HELP);
    return args.command === null && !args.flags.has("help") ? 2 : 0;
  }

  try {
    switch (args.command) {
      case "convert": {
        return await runConvert(args);
      }
      case "list": {
        return await runList(args);
      }
      case "formats": {
        return runFormats(args);
      }
      default: {
        warn(style.red(`Unknown command "${args.command}".`));
        warn("Run `standard-reader help` to see what is available.");
        return 2;
      }
    }
  } catch (error) {
    if (error instanceof ArgError) {
      warn(style.red(error.message));
      return 2;
    }
    if (error instanceof CliError) {
      warn(style.red(error.message));
      return 1;
    }
    warn(style.red(`Unexpected failure: ${describeError(error)}`));
    return 1;
  }
}
