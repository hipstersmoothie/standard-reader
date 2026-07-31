import { describe, expect, it } from "vitest";

import { ArgError, integer, many, one, parseArgs } from "../args.js";

describe("parseArgs", () => {
  it("reads the command, flags and valued options", () => {
    const args = parseArgs(["convert", "--to", "pckt", "--dry-run"]);
    expect(args.command).toBe("convert");
    expect(one(args, "to")).toBe("pckt");
    expect(args.flags.has("dry-run")).toBe(true);
  });

  it("accepts --flag=value as well as --flag value", () => {
    expect(one(parseArgs(["convert", "--to=markpub"]), "to")).toBe("markpub");
  });

  it("collects repeated options", () => {
    const args = parseArgs(["convert", "--rkey", "a", "--rkey", "b"]);
    expect(many(args, "rkey")).toEqual(["a", "b"]);
  });

  it("expands short aliases", () => {
    const args = parseArgs(["convert", "-t", "leaflet", "-n", "-y"]);
    expect(one(args, "to")).toBe("leaflet");
    expect(args.flags.has("dry-run")).toBe(true);
    expect(args.flags.has("yes")).toBe(true);
  });

  it("rejects a valued option with no value", () => {
    expect(() => parseArgs(["convert", "--to"])).toThrow(ArgError);
  });

  it("rejects a value on a boolean flag", () => {
    expect(() => parseArgs(["convert", "--dry-run=yes"])).toThrow(ArgError);
  });

  it("treats everything after -- as positional", () => {
    const args = parseArgs(["convert", "--", "--to", "pckt"]);
    expect(args.positionals).toEqual(["--to", "pckt"]);
    expect(one(args, "to")).toBeUndefined();
  });

  it("parses --limit as a positive whole number", () => {
    expect(integer(parseArgs(["list", "--limit", "5"]), "limit")).toBe(5);
    expect(() => integer(parseArgs(["list", "--limit", "0"]), "limit")).toThrow(
      ArgError,
    );
    expect(() => integer(parseArgs(["list", "--limit", "x"]), "limit")).toThrow(
      ArgError,
    );
  });
});
