# ccpool-mod

Fork of [ccpool](https://github.com/hexxt-git/ccpool): a **read-only** shared usage monitor for one Claude subscription. Each machine runs a daemon that polls Anthropic’s usage API and attributes local Claude Code activity; a small server holds the shared ledger.

This fork adds:

- `CLAUDE_CODE_OAUTH_TOKEN` from env / `~/.claude/settings.json`
- SOCKS5 outbound (default `127.0.0.1:10808`) — if the proxy is down, the daemon sends **no** Anthropic/server requests
- `scripts/install-client-cli.sh` for local client install

Requires Node ≥ 20, pnpm, and Claude Code signed in (full login with `user:profile` for usage polling — setup-tokens alone get 403).

---

## Server (VPS)

```bash
git clone <this-repo> && cd ccpool-mod
pnpm install && pnpm build
mkdir -p /var/lib/ccpool

# systemd: WorkingDirectory=…, DATABASE_URL=file:/var/lib/ccpool/server.db, PORT=8787
# ExecStart=/usr/bin/node apps/server/dist/index.js
systemctl enable --now ccpool.service
```

Put **HTTPS** in front of port 8787. Clients need `https://your-host`.

---

## Client

```bash
git clone <this-repo> && cd ccpool-mod

# optional: point at your server + SOCKS5 (SOCKS is on by default at 127.0.0.1:10808)
./scripts/install-client-cli.sh --server-url https://your-host
source ~/.bashrc   # or ~/.zshrc

ccpool init         # first time only: name, group password, member password
ccpool daemon start
ccpool              # live view
ccpool status
```

After a later `git pull`:

```bash
./scripts/install-client-cli.sh --server-url https://your-host
source ~/.bashrc
ccpool daemon restart
```

Disable SOCKS (direct outbound): only `export CCPOOL_SOCKS5_PROXY=off` — typos / `false` / empty are rejected, not treated as off (or `./scripts/install-client-cli.sh --no-socks5`).

---

## License

MIT (same as upstream).
