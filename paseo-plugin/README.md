# ask-jev Paseo plugin

Workspace panel for the ask-jev usage log: call/latency tiles, outcome breakdown, live table of recent decisions. Reads `$JEV_LOG_FILE` (default `~/.claude/ask-jev.log`), polls every 2s. Self-contained: own `package.json`/deps, separate from the zero-dep Claude Code plugin at the repo root.

Reuses [`../lib/stats.mjs`](../lib/stats.mjs) (same code as `bin/jev.mjs stats`). Paseo's bundler requires plugin modules under `client/`/`server/`/`shared/`, so `npm run sync-stats` copies it into `shared/stats.mjs` (gitignored); `lib/stats.mjs` stays canonical.

## Build

```sh
cd paseo-plugin && npm install && npm run build   # syncs, then tsc --noEmit
```

## Install

```sh
ln -s "$(pwd)/paseo-plugin" ~/.paseo/plugins/ask-jev
paseo plugin install ~/.paseo/plugins/ask-jev --id ask-jev
```

`build` in `paseo-plugin.json` runs `sync-stats` automatically. Or use Settings → Plugins → paste path → Install.

## Dev loop

Edit, then `paseo plugin reload ask-jev`. `paseo plugin logs ask-jev` shows server output.
