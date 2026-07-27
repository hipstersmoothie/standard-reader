#!/usr/bin/env node
import { runCli } from "./run.js";

process.exitCode = await runCli(process.argv.slice(2));
