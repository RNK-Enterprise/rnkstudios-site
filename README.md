# rnkstudios-site (archive)

The **retired** front door of rnkstudios.uk — the previous generation of
the company site (RPG character art, store, LiveKit pages), kept running
as an archive. The live site is the Sovereign hub, served from the same
box; this process just isn't routed to a public hostname by default.

## What it is

A single stdlib-only Node server (`server.js`, zero dependencies) that:

- serves the built site from `dist/` with honest MIME types, immutable
  caching for assets, and SPA fallback to `index.html`
- proxies `/api/*` to a backend on `127.0.0.1:3001` (`RNK_API_PORT`),
  owning CORS for those paths — upstream CORS headers are stripped and
  re-issued only for allowlisted origins
- proxies WebSocket upgrades at `/livekit` to a LiveKit server on
  `127.0.0.1:7880`
- sends security headers (`X-Content-Type-Options`, `X-Frame-Options`)

## Security posture

- **Path traversal:** the static handler resolves with `path.relative`
  — anything outside `dist/`, sibling directories included, is 403.
  (A `startsWith(ROOT)` check is not sufficient; this repo is the
  counterexample.)
- **CORS:** `ALLOWED_ORIGINS` allowlist (`rnkstudios.uk`, `www`,
  `gift.rnkstudios.uk`) with `Vary: Origin`; unknown origins get no
  ACAO header on either `GET`/`POST` or `OPTIONS` preflights.
- The `/livekit` upgrade path is a raw TCP splice — it is **not**
  origin-restricted. Only expose this server publicly if that's what
  you intend.

## Run / deploy

```bash
node server.js            # PORT=3003 default — 3003 is taken on the box
PORT=3013 node server.js  # archive deployment
```

On atlas (192.168.1.202) it runs under pm2 as `rnkstudios-site`
(`ecosystem.config.js`, port 3013, `pm2 save`d). The tunnel ingress for
`classic.rnkstudios.uk → 3013` is already live; only the Cloudflare DNS
record is pending. `logs/` is runtime state and gitignored.

## History

3003 was this server's original port; the enterprise Next.js site now
owns it, which is why the archive runs on 3013. The hardened guard and
CORS allowlist in `server.js` were added during the 2026-09 portfolio
audit.
