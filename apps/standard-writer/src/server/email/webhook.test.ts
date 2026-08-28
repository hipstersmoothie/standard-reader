import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ResendEvent, SvixHeaders } from "./webhook";
import { mapResendEvent, verifyResendSignature } from "./webhook";

describe("mapResendEvent", () => {
  it("maps a delivered event", () => {
    const payload: ResendEvent = {
      type: "email.delivered",
      data: { email_id: "msg_1", to: "reader@example.com" },
    };
    expect(mapResendEvent(payload)).toEqual({
      messageId: "msg_1",
      recipient: "reader@example.com",
      type: "delivered",
      url: undefined,
    });
  });

  it("carries the clicked link through", () => {
    const payload: ResendEvent = {
      type: "email.clicked",
      data: {
        email_id: "msg_2",
        to: ["reader@example.com"],
        click: { link: "https://standard.site/post" },
      },
    };
    expect(mapResendEvent(payload)).toEqual({
      messageId: "msg_2",
      recipient: "reader@example.com",
      type: "clicked",
      url: "https://standard.site/post",
    });
  });

  it("takes the first recipient when `to` is an array", () => {
    const event = mapResendEvent({
      type: "email.opened",
      data: { email_id: "m", to: ["a@x.com", "b@x.com"] },
    });
    expect(event?.recipient).toBe("a@x.com");
  });

  it("returns null for untracked event types", () => {
    expect(
      mapResendEvent({
        type: "email.sent",
        data: { email_id: "m", to: "a@x.com" },
      }),
    ).toBeNull();
  });

  it("returns null when the correlating id or recipient is missing", () => {
    expect(
      mapResendEvent({ type: "email.delivered", data: { to: "a@x.com" } }),
    ).toBeNull();
    expect(
      mapResendEvent({ type: "email.delivered", data: { email_id: "m" } }),
    ).toBeNull();
    expect(mapResendEvent({})).toBeNull();
  });
});

/** Produce a valid Svix signature for `body` the way Resend does. */
function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${sig}`;
}

describe("verifyResendSignature", () => {
  const secret = `whsec_${randomBytes(24).toString("base64")}`;
  const id = "msg_abc";
  const body = JSON.stringify({ type: "email.delivered" });
  const nowMs = 1_700_000_000_000;
  const timestamp = String(Math.floor(nowMs / 1000));

  function headers(overrides: Partial<SvixHeaders> = {}): SvixHeaders {
    return {
      id,
      timestamp,
      signature: sign(secret, id, timestamp, body),
      ...overrides,
    };
  }

  it("accepts a correctly signed payload", () => {
    expect(
      verifyResendSignature({ secret, headers: headers(), body, now: nowMs }),
    ).toBe(true);
  });

  it("accepts when the header carries multiple space-separated signatures", () => {
    const good = sign(secret, id, timestamp, body);
    expect(
      verifyResendSignature({
        secret,
        headers: headers({ signature: `v1,AAAA ${good}` }),
        body,
        now: nowMs,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyResendSignature({
        secret,
        headers: headers(),
        body: `${body} `,
        now: nowMs,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const otherSecret = `whsec_${randomBytes(24).toString("base64")}`;
    expect(
      verifyResendSignature({
        secret,
        headers: headers({
          signature: sign(otherSecret, id, timestamp, body),
        }),
        body,
        now: nowMs,
      }),
    ).toBe(false);
  });

  it("rejects a stale timestamp beyond tolerance", () => {
    expect(
      verifyResendSignature({
        secret,
        headers: headers(),
        body,
        now: nowMs + 10 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it("rejects missing headers or secret", () => {
    expect(
      verifyResendSignature({
        secret,
        headers: headers({ signature: null }),
        body,
        now: nowMs,
      }),
    ).toBe(false);
    expect(
      verifyResendSignature({
        secret: "",
        headers: headers(),
        body,
        now: nowMs,
      }),
    ).toBe(false);
  });
});
