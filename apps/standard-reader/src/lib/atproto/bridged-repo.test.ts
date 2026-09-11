import { describe, expect, it } from "vitest";

import {
  bridgeHandlePattern,
  curatedBridgeExclusion,
  isBridgeHandle,
  isExcludedBridgeHandle,
  isWebBridgeHandle,
} from "./bridged-repo.ts";

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

describe("isBridgeHandle", () => {
  it("covers both bridges", () => {
    expect(isBridgeHandle("karapaia.com.web.brid.gy")).toBe(true);
    expect(isBridgeHandle("alice.ap.brid.gy")).toBe(true);
    expect(isBridgeHandle("Alice.AP.Brid.Gy")).toBe(true);
  });

  it("applies the same suffix discipline as the web-bridge test", () => {
    expect(isBridgeHandle("tom.sherman.is")).toBe(false);
    expect(isBridgeHandle("brid.gy.example.com")).toBe(false);
    // The suffix carries its leading dot.
    expect(isBridgeHandle("notbrid.gy")).toBe(false);
    expect(isBridgeHandle(null)).toBe(false);
  });
});

describe("bridgeHandlePattern", () => {
  it("widens from the web bridge to every bridge", () => {
    expect(bridgeHandlePattern("web")).toBe("%.web.brid.gy");
    expect(bridgeHandlePattern("all")).toBe("%.brid.gy");
  });
});

describe("curatedBridgeExclusion", () => {
  it("floors a curated surface at the web bridge", () => {
    // Discover's rails drop the bulk mirrors for everyone, signed in or not.
    expect(curatedBridgeExclusion(false)).toBe("web");
    expect(curatedBridgeExclusion("web")).toBe("web");
  });

  it("never narrows a wider request-level exclusion", () => {
    // A signed-out reader hides every bridge; the rails must not add them back.
    expect(curatedBridgeExclusion("all")).toBe("all");
  });
});

describe("isExcludedBridgeHandle", () => {
  it("hides nothing when the request excludes nothing", () => {
    expect(isExcludedBridgeHandle("karapaia.com.web.brid.gy", false)).toBe(
      false,
    );
    expect(isExcludedBridgeHandle("alice.ap.brid.gy", false)).toBe(false);
  });

  it('keeps the opt-in bridge under "web"', () => {
    expect(isExcludedBridgeHandle("karapaia.com.web.brid.gy", "web")).toBe(
      true,
    );
    expect(isExcludedBridgeHandle("alice.ap.brid.gy", "web")).toBe(false);
  });

  it('hides both bridges under "all" — the signed-out app', () => {
    expect(isExcludedBridgeHandle("karapaia.com.web.brid.gy", "all")).toBe(
      true,
    );
    expect(isExcludedBridgeHandle("alice.ap.brid.gy", "all")).toBe(true);
    expect(isExcludedBridgeHandle("tom.sherman.is", "all")).toBe(false);
    expect(isExcludedBridgeHandle(null, "all")).toBe(false);
  });
});
