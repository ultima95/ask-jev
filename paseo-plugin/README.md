# ask-jev Paseo plugin

Workspace panel for the ask-jev usage log: call/latency tiles, outcome breakdown, live table of recent decisions. Reads `$JEV_LOG_FILE` (default `~/.claude/ask-jev.log`), polls every 2s. Self-contained: own `package.json`/deps, separate from the zero-dep Claude Code plugin at the repo root.

Reuses [`../lib/stats.mjs`](../lib/stats.mjs) (same code as `bin/jev.mjs stats`), committed as `shared/stats.mjs` since Paseo stages only `paseo-plugin/` on a standalone install — `lib/stats.mjs` stays canonical, CI fails if the copy drifts.

## Install

Settings → Plugins → paste into "Plugin source" → Install:

```
github:yanmad27/ask-jev:paseo-plugin
```

Or via CLI:

```sh
paseo plugin install github:yanmad27/ask-jev:paseo-plugin --id ask-jev
```

Developing in this repo? Point at your local checkout instead, so `paseo plugin reload ask-jev` picks up edits without pushing:

```sh
paseo plugin install ./paseo-plugin --id ask-jev
```

## Open it

Cmd+K / Ctrl+K → "Ask Jev" (Command Center — panels aren't Cmd+K searchable on
their own, so `index.client.tsx` registers both `addWorkspacePanel` and an
`addCommandCenterItem` that opens it).

## Dev loop

`cd paseo-plugin && npm install && npm run build` (syncs `shared/stats.mjs`, then `tsc --noEmit`). After editing `../lib/stats.mjs`, run `npm run sync-stats` before `paseo plugin reload ask-jev` — the manifest no longer runs it for you. `paseo plugin logs ask-jev` shows server output.
