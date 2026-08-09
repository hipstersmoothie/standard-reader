import { afterEach, describe, expect, it } from "vitest";

import { pushConfig } from "./config";

/**
 * `canRegister` and `canSend` are deliberately different gates, and conflating
 * them is not hypothetical — it shipped. The web service holds only the public
 * key (the private key belongs to the send cron alone), so gating device
 * registration on both made the bell report "we couldn't set up notifications on
 * this device" on a correctly configured deployment.
 */
const ORIGINAL = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

function setKeys(publicKey?: string, privateKey?: string): void {
  if (publicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = publicKey;
  if (privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = privateKey;
}

afterEach(() => {
  setKeys(ORIGINAL.publicKey, ORIGINAL.privateKey);
});

describe("pushConfig gates", () => {
  it("lets a browser subscribe with only the public key — the web service's state", () => {
    setKeys("pub", undefined);
    expect(pushConfig.canRegister).toBe(true);
    expect(pushConfig.canSend).toBe(false);
  });

  it("allows sending only when both keys are present — the cron's state", () => {
    setKeys("pub", "priv");
    expect(pushConfig.canRegister).toBe(true);
    expect(pushConfig.canSend).toBe(true);
  });

  it("refuses both with no keys, so a PR preview can't send", () => {
    setKeys(undefined, undefined);
    expect(pushConfig.canRegister).toBe(false);
    expect(pushConfig.canSend).toBe(false);
  });

  it("refuses to send with a private key but no public key", () => {
    setKeys(undefined, "priv");
    expect(pushConfig.canRegister).toBe(false);
    expect(pushConfig.canSend).toBe(false);
  });
});
