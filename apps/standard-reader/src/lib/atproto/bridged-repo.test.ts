import { describe, expect, it } from "vitest";

import { isWebBridgeHandle } from "./bridged-repo.ts";

describe("isWebBridgeHandle", () => {
  it("separates the bulk web bridge from the ActivityPub one", () => {
    expect(isWebBridgeHandle("karapaia.com.web.brid.gy")).toBe(true);
    // Those authors chose to bridge; they belong in the curated surfaces.
    expect(isWebBridgeHandle("alice.ap.brid.gy")).toBe(false);
    // Handles arrive from DID documents, which do not guarantee a case.
    expect(isWebBridgeHandle("Karapaia.com.Web.Brid.Gy")).toBe(true);
  });

  it("leaves ordinary publishers alone", () => {
    expect(isWebBridgeHandle("tom.sherman.is")).toBe(false);
    expect(isWebBridgeHandle("youronly.one")).toBe(false);
    // Only a real suffix match counts — someone else's domain that merely
    // contains or trails off the string is not a Bridgy repo.
    expect(isWebBridgeHandle("web.brid.gy.example.com")).toBe(false);
    // The suffix carries its leading dot, so a domain that merely ends in the
    // same letters is not a bridge repo.
    expect(isWebBridgeHandle("notweb.brid.gy")).toBe(false);
  });

  it("treats an unresolved handle as not bridged", () => {
    // Hiding a real publisher over a transient DID-document failure is the
    // worse mistake.
    expect(isWebBridgeHandle(null)).toBe(false);
    expect(isWebBridgeHandle("")).toBe(false);
  });
});
