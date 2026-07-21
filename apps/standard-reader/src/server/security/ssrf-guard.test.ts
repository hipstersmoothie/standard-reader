import { describe, expect, it } from "vitest";

import { assertSafeFetchUrl } from "./ssrf-guard";

describe("assertSafeFetchUrl", () => {
  describe("accepts safe URLs", () => {
    const safeUrls = [
      "https://plc.directory/did:plc:abc123",
      "https://example.com/.well-known/did.json",
      "https://bsky.social/xrpc/com.atproto.server.getSession",
      "https://8.8.8.8/.well-known/did.json",
      "https://1.1.1.1/test",
      "https://[2606:4700:4700::1111]/test",
    ];

    for (const url of safeUrls) {
      it(`accepts ${url}`, () => {
        expect(() => assertSafeFetchUrl(url)).not.toThrow();
      });
    }
  });

  describe("rejects non-HTTPS when requireHttps is true", () => {
    const httpUrls = [
      "http://example.com/test",
      "http://169.254.169.254/latest/meta-data",
      "ftp://example.com/test",
    ];

    for (const url of httpUrls) {
      it(`rejects ${url}`, () => {
        expect(() => assertSafeFetchUrl(url)).toThrow(/non-HTTPS/);
      });
    }

    it("allows HTTP when requireHttps is false", () => {
      expect(() =>
        assertSafeFetchUrl("http://example.com/test", { requireHttps: false }),
      ).not.toThrow();
    });
  });

  describe("rejects blocked IPv4 literals", () => {
    const blockedIpv4 = [
      "https://0.0.0.0/test",
      "https://10.0.0.1/test",
      "https://10.255.255.255/test",
      "https://100.64.0.1/test",
      "https://100.127.255.255/test",
      "https://127.0.0.1/test",
      "https://127.255.255.255/test",
      "https://169.254.169.254/latest/meta-data",
      "https://169.254.0.1/test",
      "https://169.254.255.254/test",
      "https://172.16.0.1/test",
      "https://172.31.255.255/test",
      "https://192.0.0.1/test",
      "https://192.168.1.1/test",
      "https://192.168.0.1/test",
      "https://198.18.0.1/test",
      "https://198.19.255.255/test",
    ];

    for (const url of blockedIpv4) {
      it(`rejects ${url}`, () => {
        expect(() => assertSafeFetchUrl(url)).toThrow(/blocked IP/);
      });
    }
  });

  describe("rejects blocked IPv6 literals", () => {
    const blockedIpv6 = [
      "https://[::1]/test",
      "https://[fe80::1]/test",
      "https://[fc00::1]/test",
      "https://[fd00::1]/test",
      "https://[fe80::1234]/test",
      "https://[fea0::1]/test",
      "https://[::ffff:169.254.169.254]/test",
      "https://[::ffff:127.0.0.1]/test",
      "https://[::ffff:10.0.0.1]/test",
    ];

    for (const url of blockedIpv6) {
      it(`rejects ${url}`, () => {
        expect(() => assertSafeFetchUrl(url)).toThrow(/blocked/);
      });
    }
  });

  describe("rejects blocked hostnames", () => {
    const blockedHostnames = [
      "https://localhost/test",
      "https://foo.local/test",
      "https://bar.internal/test",
      "https://service.localhost/test",
      "https://foo.home.arpa/test",
      "https://myhost.localdomain/test",
      "https://ip6-localhost/test",
    ];

    for (const url of blockedHostnames) {
      it(`rejects ${url}`, () => {
        expect(() => assertSafeFetchUrl(url)).toThrow(/blocked hostname/);
      });
    }
  });

  it("rejects invalid URLs", () => {
    expect(() => assertSafeFetchUrl("not-a-url")).toThrow(/invalid URL/);
    expect(() => assertSafeFetchUrl("")).toThrow(/invalid URL/);
  });
});
