import { resolveOutboundFetch, type Socks5Proxy } from "@ccpool/core";

/**
 * Shared mutable fetch for CLI HTTP clients (daemon ingest + status views).
 * When SOCKS5 is configured, the daemon updates `current` each tick; views
 * resolve fresh via {@link outboundFetchForCli}.
 */
export const outboundFetchHolder: { current: typeof fetch } = {
  current: globalThis.fetch,
};

/** Build a SOCKS5-aware fetch (or fail closed if the proxy is configured but down). */
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
