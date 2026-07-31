import { describe, expect, it } from "vitest";

import {
  isBridgedHandle,
  isExcludedBridgeHandle,
  isWebBridgeHandle,
} from "./bridged-repo.ts";

describe("isBridgedHandle", () => {
  it("recognises both Bridgy bridges", () => {
    expect(isBridgedHandle("karapaia.com.web.brid.gy")).toBe(true);
    expect(isBridgedHandle("alice.ap.brid.gy")).toBe(true);
    // Handles arrive from DID documents, which do not guarantee a case.
    expect(isBridgedHandle("Karapaia.com.Web.Brid.Gy")).toBe(true);
  });

  it("leaves ordinary publishers in the main lane", () => {
    expect(isBridgedHandle("tom.sherman.is")).toBe(false);
    expect(isBridgedHandle("youronly.one")).toBe(false);
    // Only a real suffix match counts — someone else's domain that merely
    // contains or trails off the string is not a Bridgy repo.
    expect(isBridgedHandle("brid.gy.example.com")).toBe(false);
    expect(isBridgedHandle("notbrid.gy")).toBe(false);
  });

  it("routes an unresolved handle down the main lane", () => {
    // Misrouting a real publisher over a transient DID-document failure is
    // worse than either alternative.
    expect(isBridgedHandle(null)).toBe(false);
    expect(isBridgedHandle("")).toBe(false);
  });
});

describe("isWebBridgeHandle", () => {
  it("separates the bulk web bridge from the ActivityPub one", () => {
    expect(isWebBridgeHandle("karapaia.com.web.brid.gy")).toBe(true);
    expect(isWebBridgeHandle("alice.ap.brid.gy")).toBe(false);
  });
});

describe("isExcludedBridgeHandle", () => {
  it("turns the bulk web bridge away when there is no lane for it", () => {
    const noLane = { hasBridgeLane: false };
    expect(isExcludedBridgeHandle("karapaia.com.web.brid.gy", noLane)).toBe(
      true,
    );
  });

  it("welcomes the web bridge once a lane exists", () => {
    // Configuring the isolated tap is what turns Bridgy fully back on — there
    // is deliberately no second switch to remember.
    const withLane = { hasBridgeLane: true };
    expect(isExcludedBridgeHandle("karapaia.com.web.brid.gy", withLane)).toBe(
      false,
    );
  });

  it("never excludes the ActivityPub bridge — those authors opted in", () => {
    expect(
      isExcludedBridgeHandle("alice.ap.brid.gy", { hasBridgeLane: false }),
    ).toBe(false);
    expect(
      isExcludedBridgeHandle("alice.ap.brid.gy", { hasBridgeLane: true }),
    ).toBe(false);
  });

  it("never excludes an ordinary or unresolved repo", () => {
    const noLane = { hasBridgeLane: false };
    expect(isExcludedBridgeHandle("tom.sherman.is", noLane)).toBe(false);
    expect(isExcludedBridgeHandle(null, noLane)).toBe(false);
  });
});
