// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyForcedColumnBreaks,
  clearForcedColumnBreaks,
  supportsForcedColumnBreaks,
} from "./feature-layout";

describe("supportsForcedColumnBreaks", () => {
  it("returns a boolean", () => {
    expect(typeof supportsForcedColumnBreaks()).toBe("boolean");
  });
});

describe("applyForcedColumnBreaks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts a spacer when a break target is mid-column", () => {
    const flow = document.createElement("div");
    document.body.append(flow);

    Object.defineProperty(flow, "clientHeight", { value: 400 });
    flow.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 800,
        bottom: 400,
        width: 800,
        height: 400,
      }) as DOMRect;

    const opener = document.createElement("header");
    opener.className = "opener";
    opener.getBoundingClientRect = () =>
      ({
        top: 250,
        left: 0,
        right: 300,
        bottom: 300,
        width: 300,
        height: 50,
      }) as DOMRect;
    flow.append(opener);

    const changed = applyForcedColumnBreaks(flow);
    const spacer = flow.querySelector("[data-mag-col-spacer]");

    if (supportsForcedColumnBreaks()) {
      expect(changed).toBe(false);
      expect(spacer).toBeNull();
    } else {
      expect(changed).toBe(true);
      expect(spacer).not.toBeNull();
      expect((spacer as HTMLElement).style.height).toBe("150px");
    }
  });

  it("clears spacers before re-applying", () => {
    const flow = document.createElement("div");
    flow.innerHTML =
      '<div data-mag-col-spacer="1" class="mag-col-spacer"></div><header class="opener"></header>';
    document.body.append(flow);

    clearForcedColumnBreaks(flow);
    expect(flow.querySelector("[data-mag-col-spacer]")).toBeNull();
  });
});
