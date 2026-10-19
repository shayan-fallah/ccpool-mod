import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCKS5_PROXY,
  Socks5ProxyConfigError,
  parseSocks5Proxy,
  resolveSocks5Proxy,
  resolveOutboundFetch,
  isSocks5ProxyReachable,
} from "./socks5.js";

describe("parseSocks5Proxy", () => {
  it("parses host:port", () => {
    expect(parseSocks5Proxy("127.0.0.1:10808")).toEqual({ host: "127.0.0.1", port: 10808 });
  });

  it("parses socks5:// URLs", () => {
    expect(parseSocks5Proxy("socks5://127.0.0.1:10808")).toEqual({
      host: "127.0.0.1",
      port: 10808,
    });
  });

  it("treats exactly off as disabled", () => {
    expect(parseSocks5Proxy("off")).toBeNull();
    expect(parseSocks5Proxy("  off  ")).toBeNull();
  });

  it("rejects empty, false, and typos instead of treating them as off", () => {
    for (const raw of ["", "false", "no", "0", "OFF", "of", "127.0.0.1", "oops:xyz"]) {
      expect(() => parseSocks5Proxy(raw)).toThrow(Socks5ProxyConfigError);
      expect(() => parseSocks5Proxy(raw)).toThrow(/fix and retry/);
    }
  });
});

describe("resolveSocks5Proxy", () => {
  it("reads CCPOOL_SOCKS5_PROXY", () => {
    expect(resolveSocks5Proxy({ CCPOOL_SOCKS5_PROXY: "127.0.0.1:10808" })).toEqual({
      host: "127.0.0.1",
      port: 10808,
    });
  });

  it("disables only when CCPOOL_SOCKS5_PROXY is exactly off", () => {
    expect(resolveSocks5Proxy({ CCPOOL_SOCKS5_PROXY: "off" })).toBeNull();
  });

  it("defaults to 127.0.0.1:10808 when env is unset (SOCKS required)", () => {
    expect(resolveSocks5Proxy({})).toEqual(parseSocks5Proxy(DEFAULT_SOCKS5_PROXY));
  });

  it("throws on a mistyped CCPOOL_SOCKS5_PROXY (never silent direct)", () => {
    expect(() => resolveSocks5Proxy({ CCPOOL_SOCKS5_PROXY: "127.0.0.1:socks" })).toThrow(
      Socks5ProxyConfigError
    );
  });
});

describe("resolveOutboundFetch", () => {
  it("returns a fix-hint failure for malformed CCPOOL_SOCKS5_PROXY (no direct)", async () => {
    const result = await resolveOutboundFetch({ CCPOOL_SOCKS5_PROXY: "typo-proxy" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.proxy).toBeNull();
      expect(result.reason).toMatch(/invalid CCPOOL_SOCKS5_PROXY/);
      expect(result.reason).toMatch(/fix and retry/);
    }
  });

  it("allows direct only when CCPOOL_SOCKS5_PROXY is exactly off", async () => {
    const result = await resolveOutboundFetch({ CCPOOL_SOCKS5_PROXY: "off" });
    expect(result).toEqual({ ok: true, fetchImpl: globalThis.fetch, proxy: null });
  });
});

describe("isSocks5ProxyReachable", () => {
  it("returns false for a closed local port", async () => {
    // 1 is privileged / nothing listens in CI — must be unreachable for us.
    const ok = await isSocks5ProxyReachable({ host: "127.0.0.1", port: 1 }, 200);
    expect(ok).toBe(false);
  });
});
