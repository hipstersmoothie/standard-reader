import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authenticateKosync,
  kosyncAuthKeyForDid,
  kosyncKeyForDid,
  newKosyncSalt,
} from "#/server/kosync/credentials";

const DID = "did:plc:vmdqoelhettxubov4hejncg2";
const OTHER = "did:plc:stznz7qsokto2345qtdzogjb";
const SALT = "3PPOtKbmk3rQ0tKcHRAA1Q";

function request(headers: Record<string, string>): Request {
  return new Request("https://example.invalid/kosync/users/auth", { headers });
}

const resolve =
  (salt: string | null = null) =>
  async (username: string) =>
    username === "reader.example" ? { did: DID, salt } : null;

describe("kosyncKeyForDid", () => {
  it("is stable for a DID and different for another", () => {
    expect(kosyncKeyForDid(DID, null)).toBe(kosyncKeyForDid(DID, null));
    expect(kosyncKeyForDid(DID, null)).not.toBe(kosyncKeyForDid(OTHER, null));
  });

  it("is typeable on an e-reader keyboard", () => {
    // Lowercase, no look-alike characters (no l/1/i, no o/0), fixed length.
    expect(kosyncKeyForDid(DID, null)).toMatch(/^[a-z2-9]{20}$/);
    expect(kosyncKeyForDid(DID, null)).not.toMatch(/[ilo01]/);
    expect(kosyncKeyForDid(DID, SALT)).toMatch(/^[a-z2-9]{20}$/);
  });

  it("hands KOReader the MD5 of the key, which is what it sends", () => {
    expect(kosyncAuthKeyForDid(DID, null)).toBe(
      createHash("md5").update(kosyncKeyForDid(DID, null)).digest("hex"),
    );
  });

  it("keeps deriving the original key for a reader who never rotated", () => {
    // `null` is what every account carries until it rotates, so this is the
    // guarantee that shipping rotation did not log every device out.
    expect(kosyncKeyForDid(DID, null)).toBe(kosyncKeyForDid(DID, null));
  });

  it("changes the key when the salt changes", () => {
    expect(kosyncKeyForDid(DID, SALT)).not.toBe(kosyncKeyForDid(DID, null));
    expect(kosyncKeyForDid(DID, SALT)).not.toBe(
      kosyncKeyForDid(DID, newKosyncSalt()),
    );
  });
});

describe("newKosyncSalt", () => {
  it("is different every time", () => {
    const salts = new Set(Array.from({ length: 50 }, () => newKosyncSalt()));
    expect(salts.size).toBe(50);
  });
});

describe("authenticateKosync", () => {
  it("accepts the right key for a resolvable username", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID, null),
        "x-auth-user": "reader.example",
      }),
      resolve(),
    );
    expect(did).toBe(DID);
  });

  it("accepts an upper-case key, which some clients send", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID, null).toUpperCase(),
        "x-auth-user": "reader.example",
      }),
      resolve(),
    );
    expect(did).toBe(DID);
  });

  it("rejects the old key once the reader has rotated", async () => {
    // The whole point of rotation: a device holding the previous key stops
    // syncing the moment the new salt lands.
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID, null),
        "x-auth-user": "reader.example",
      }),
      resolve(SALT),
    );
    expect(did).toBeNull();
  });

  it("accepts the new key after rotating", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID, SALT),
        "x-auth-user": "reader.example",
      }),
      resolve(SALT),
    );
    expect(did).toBe(DID);
  });

  it("rejects another reader's key", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(OTHER, null),
        "x-auth-user": "reader.example",
      }),
      resolve(),
    );
    expect(did).toBeNull();
  });

  it("rejects an unknown username without checking the key", async () => {
    const did = await authenticateKosync(
      request({
        "x-auth-key": kosyncAuthKeyForDid(DID, null),
        "x-auth-user": "nobody.example",
      }),
      resolve(),
    );
    expect(did).toBeNull();
  });

  it("rejects a request with no credentials", async () => {
    expect(await authenticateKosync(request({}), resolve())).toBeNull();
    expect(
      await authenticateKosync(
        request({ "x-auth-user": "reader.example" }),
        resolve(),
      ),
    ).toBeNull();
  });
});
