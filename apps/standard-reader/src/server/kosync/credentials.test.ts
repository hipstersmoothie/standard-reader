import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authenticateKosync,
  kosyncAuthKeyForDid,
  kosyncKeyForDid,
} from "#/server/kosync/credentials";

const DID = "did:plc:vmdqoelhettxubov4hejncg2";
const OTHER = "did:plc:stznz7qsokto2345qtdzogjb";

function request(headers: Record<string, string>): Request {
  return new Request("https://example.invalid/kosync/users/auth", { headers });
}

const resolve = async (username: string) =>
  username === "reader.example" ? DID : null;

describe("kosyncKeyForDid", () => {
  it("is stable for a DID and different for another", () => {
    expect(kosyncKeyForDid(DID)).toBe(kosyncKeyForDid(DID));
    expect(kosyncKeyForDid(DID)).not.toBe(kosyncKeyForDid(OTHER));
  });

  it("is typeable on an e-reader keyboard", () => {
    // Lowercase, no look-alike characters (no l/1/i, no o/0), fixed length.
    expect(kosyncKeyForDid(DID)).toMatch(/^[a-z2-9]{20}$/);
    expect(kosyncKeyForDid(DID)).not.toMatch(/[ilo01]/);
  });

  it("hands KOReader the MD5 of the key, which is what it sends", () => {
    expect(kosyncAuthKeyForDid(DID)).toBe(
      createHash("md5").update(kosyncKeyForDid(DID)).digest("hex"),
    );
  });
});

describe("authenticateKosync", () => {
  it("accepts the right key for a resolvable username", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID),
        "x-auth-user": "reader.example",
      }),
      resolve,
    );
    expect(did).toBe(DID);
  });

  it("accepts an upper-case key, which some clients send", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID).toUpperCase(),
        "x-auth-user": "reader.example",
      }),
      resolve,
    );
    expect(did).toBe(DID);
  });

  it("rejects another reader's key", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(OTHER),
        "x-auth-user": "reader.example",
      }),
      resolve,
    );
    expect(did).toBeNull();
  });

  it("rejects an unknown username without checking the key", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID),
        "x-auth-user": "nobody.example",
      }),
      resolve,
    );
    expect(did).toBeNull();
  });

  it("rejects a request with no credentials", async () => {
    expect(await authenticateKosync(request({}), resolve)).toBeNull();
    expect(
      await authenticateKosync(
        request({ "x-auth-user": "reader.example" }),
        resolve,
      ),
    ).toBeNull();
  });
});
