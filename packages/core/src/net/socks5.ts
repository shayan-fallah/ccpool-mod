import { connect } from "node:net";

/** Default local SOCKS5 endpoint (common Clash / v2ray inbound). */
export const DEFAULT_SOCKS5_PROXY = "127.0.0.1:10808";

export interface Socks5Proxy {
  host: string;
  port: number;
}

/**
 * Parse `host:port`, `socks5://host:port`, or `socks5h://host:port`.
 * Returns null for empty / disabled values.
 */
export function parseSocks5Proxy(raw: string | undefined | null): Socks5Proxy | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "0" ||
    trimmed === "off" ||
    trimmed === "false" ||
    trimmed === "no"
  ) {
    return null;
  }

  let hostPort = trimmed;
  if (/^socks5h?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const port = u.port ? Number(u.port) : 1080;
      if (!u.hostname || !Number.isFinite(port) || port <= 0) return null;
      return { host: u.hostname, port };
    } catch {
      return null;
    }
  }

  // host:port (IPv6 in brackets: [::1]:10808)
  const bracket = /^\[([^\]]+)\]:(\d+)$/.exec(hostPort);
  if (bracket) {
    const port = Number(bracket[2]);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { host: bracket[1]!, port };
  }

  const colon = hostPort.lastIndexOf(":");
  if (colon <= 0) return null;
  const host = hostPort.slice(0, colon);
  const port = Number(hostPort.slice(colon + 1));
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  return { host, port };
}

/**
 * Resolve SOCKS5 settings from the environment.
 *
 * - `CCPOOL_SOCKS5_PROXY` — explicit proxy (`127.0.0.1:10808`, `socks5://…`), or
 *   `off` / empty / `false` to allow **direct** outbound (no proxy).
 * - If unset: **default ON** at {@link DEFAULT_SOCKS5_PROXY}. Anthropic / ledger
 *   traffic must not go direct unless the user explicitly disables the proxy —
 *   a daemon started without shell env (GUI, bare `node`, …) still requires SOCKS5.
 */
export function resolveSocks5Proxy(env: NodeJS.ProcessEnv = process.env): Socks5Proxy | null {
  if (Object.prototype.hasOwnProperty.call(env, "CCPOOL_SOCKS5_PROXY")) {
    return parseSocks5Proxy(env.CCPOOL_SOCKS5_PROXY);
  }
  return parseSocks5Proxy(DEFAULT_SOCKS5_PROXY);
}

/** `host:port` form for logs / injecting into a child process env. */
export function formatSocks5Proxy(proxy: Socks5Proxy): string {
  return `${proxy.host}:${proxy.port}`;
}

/** TCP probe — is anything accepting connections on the proxy port? */
export function isSocks5ProxyReachable(proxy: Socks5Proxy, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: proxy.host, port: proxy.port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * `fetch` that tunnels through the SOCKS5 proxy (undici + fetch-socks).
 * Used for Anthropic usage polls and the ccpool server HTTP client when a proxy
 * is configured.
 */
export async function createSocks5Fetch(proxy: Socks5Proxy): Promise<typeof fetch> {
  const { socksDispatcher } = await import("fetch-socks");
  const { fetch: undiciFetch } = await import("undici");
  const dispatcher = socksDispatcher({
    type: 5,
    host: proxy.host,
    port: proxy.port,
  });
  const socksFetch: typeof fetch = (input, init) =>
    undiciFetch(input as string | URL, {
      ...(init as Record<string, unknown>),
      dispatcher,
    }) as unknown as ReturnType<typeof fetch>;
  return socksFetch;
}

export type OutboundFetch =
  | { ok: true; fetchImpl: typeof fetch; proxy: Socks5Proxy | null }
  | { ok: false; proxy: Socks5Proxy; reason: string };

/**
 * Pick the outbound `fetch` for this process.
 *
 * - Proxy disabled (`CCPOOL_SOCKS5_PROXY=off`) → global `fetch`, always ok.
 * - Proxy required (default) and reachable → SOCKS5-wrapped `fetch` only.
 * - Proxy required but down / broken → `{ ok: false }` (callers must not send;
 *   never fall back to direct).
 */
export async function resolveOutboundFetch(
  env: NodeJS.ProcessEnv = process.env,
  opts: { probeTimeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<OutboundFetch> {
  const proxy = resolveSocks5Proxy(env);
  if (!proxy) {
    // Explicitly disabled — direct is allowed.
    return { ok: true, fetchImpl: opts.fetchImpl ?? globalThis.fetch, proxy: null };
  }
  const up = await isSocks5ProxyReachable(proxy, opts.probeTimeoutMs ?? 500);
  if (!up) {
    return {
      ok: false,
      proxy,
      reason: `socks5 proxy unreachable at ${formatSocks5Proxy(proxy)} — refusing direct outbound`,
    };
  }
  try {
    const fetchImpl = await createSocks5Fetch(proxy);
    return { ok: true, fetchImpl, proxy };
  } catch (err) {
    // Bundling / missing native deps must not crash the daemon tick — treat like
    // a down proxy so the next interval can retry (and surface a clear reason).
    // Never fall back to global fetch while a proxy is required.
    return {
      ok: false,
      proxy,
      reason: `socks5 proxy setup failed (${(err as Error).message}) — refusing direct outbound`,
    };
  }
}
