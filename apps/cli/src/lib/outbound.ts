import {
  isAnthropicApiUrl,
  resolveOutboundFetch,
  resolveSocks5Proxy,
  Socks5ProxyConfigError,
  type Socks5Proxy,
} from "@ccpool/core";

/**
 * Fetch that refuses Anthropic (and, when SOCKS5 is required, all outbound)
 * until {@link outboundFetchForCli} / the daemon tick installs a real transport.
 * Prevents a race where HttpIngestSink/HttpViewSource run before SOCKS is ready
 * and accidentally use global `fetch` → direct Claude.
 */
const unsetOutboundFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (isAnthropicApiUrl(url)) {
    return Promise.reject(
      new Error("refusing direct Anthropic request — SOCKS5 outbound not resolved yet")
    );
  }
  let socksRequired: boolean;
  try {
    socksRequired = resolveSocks5Proxy(process.env) !== null;
  } catch (err) {
    if (err instanceof Socks5ProxyConfigError) {
      return Promise.reject(err);
    }
    throw err;
  }
  if (socksRequired) {
    return Promise.reject(
      new Error("refusing outbound request — SOCKS5 outbound not resolved yet")
    );
  }
  return globalThis.fetch(input, init);
};

/**
 * Shared mutable fetch for CLI HTTP clients (daemon ingest + status views).
 * When SOCKS5 is required (default), `current` must be the SOCKS5-wrapped fetch
 * — never global `fetch` — before any Claude or ledger HTTP runs.
 */
export const outboundFetchHolder: { current: typeof fetch } = {
  current: unsetOutboundFetch,
};

/** Build a SOCKS5-aware fetch (or fail closed if the proxy is required but down). */
export async function outboundFetchForCli(
  env: NodeJS.ProcessEnv = process.env
): Promise<
  { ok: true; fetchImpl: typeof fetch; proxy: Socks5Proxy | null } | { ok: false; reason: string }
> {
  const result = await resolveOutboundFetch(env);
  if (!result.ok) return { ok: false, reason: result.reason };
  outboundFetchHolder.current = result.fetchImpl;
  return result;
}
