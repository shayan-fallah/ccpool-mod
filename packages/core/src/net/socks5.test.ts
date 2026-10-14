import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCKS5_PROXY,
  parseSocks5Proxy,
  resolveSocks5Proxy,
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

  it("treats off/empty as disabled", () => {
    expect(parseSocks5Proxy("")).toBeNull();
    expect(parseSocks5Proxy("off")).toBeNull();
    expect(parseSocks5Proxy("false")).toBeNull();
  });
});

describe("resolveSocks5Proxy", () => {
  it("reads CCPOOL_SOCKS5_PROXY", () => {
    expect(resolveSocks5Proxy({ CCPOOL_SOCKS5_PROXY: "127.0.0.1:10808" })).toEqual({
      host: "127.0.0.1",
      port: 10808,
    });
  });

  it("disables when CCPOOL_SOCKS5_PROXY is off even if CCPOOL_SOCKS5=1", () => {
    expect(resolveSocks5Proxy({ CCPOOL_SOCKS5_PROXY: "off", CCPOOL_SOCKS5: "1" })).toBeNull();
  });

  it("defaults to 127.0.0.1:10808 when CCPOOL_SOCKS5=1 and proxy unset", () => {
    expect(resolveSocks5Proxy({ CCPOOL_SOCKS5: "1" })).toEqual(
      parseSocks5Proxy(DEFAULT_SOCKS5_PROXY)
    );
  });

  it("is off when neither env is set", () => {
    expect(resolveSocks5Proxy({})).toBeNull();
  });
});

describe("isSocks5ProxyReachable", () => {
  it("returns false for a closed local port", async () => {
    // 1 is privileged / nothing listens in CI — must be unreachable for us.
    const ok = await isSocks5ProxyReachable({ host: "127.0.0.1", port: 1 }, 200);
    expect(ok).toBe(false);
  });
});
