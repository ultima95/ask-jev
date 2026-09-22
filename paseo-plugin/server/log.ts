import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { computeStats, filterSince, parseEvents, recentDecisions, sinceMsFromSpec } from "../shared/stats.mjs";
import type { JevStats } from "../shared/contracts";
import { jevStatsRpc } from "../shared/contracts";

const RECENT_LIMIT = 200;

interface StatsSummary {
  calls: { total: number; ok: number; error: number; avg_latency_ms: number; p95_latency_ms: number };
  decisions: { total: number; by_outcome: Record<string, number> };
}

interface LogEvent {
  ts: string;
  kind: string;
  outcome?: string;
  question?: string;
  label?: string;
  confidence?: number;
}

let cache: { path: string; mtimeMs: number; size: number; events: LogEvent[] } | null = null;

/** Re-parses only when mtime/size change — the 2s panel poll must not re-read an unchanged file. */
function loadEvents(path: string): LogEvent[] | null {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.path === path && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return cache.events;
  }
  const events = parseEvents(readFileSync(path, "utf8")) as LogEvent[];
  cache = { path, mtimeMs: stat.mtimeMs, size: stat.size, events };
  return events;
}

function logPath(): string {
  return process.env.JEV_LOG_FILE || join(homedir(), ".claude", "ask-jev.log");
}

function emptyStats(path: string): JevStats {
  return {
    logPath: path,
    hasLog: false,
    calls: { total: 0, ok: 0, error: 0, avg_latency_ms: 0, p95_latency_ms: 0 },
    decisions: { total: 0, by_outcome: {}, answered_pct: 0, fallback_pct: 0 },
    recent: [],
  };
}

export function getStats({ since, outcome }: RpcInput<typeof jevStatsRpc>): JevStats {
  const path = logPath();
  const allEvents = loadEvents(path);
  if (!allEvents) return emptyStats(path);

  const events = filterSince(allEvents, sinceMsFromSpec(since));
  const summary = computeStats(events) as StatsSummary;
  const total = summary.decisions.total;
  const answered = summary.decisions.by_outcome.answered ?? 0;

  // Filter by outcome before capping, so a rare outcome isn't crowded out by the 200-row cap.
  let recent = recentDecisions(events, events.length) as LogEvent[];
  if (outcome !== "all") recent = recent.filter((d) => d.outcome === outcome);
  recent = recent.slice(0, RECENT_LIMIT);

  return {
    logPath: path,
    hasLog: true,
    calls: summary.calls,
    decisions: {
      total,
      by_outcome: summary.decisions.by_outcome,
      answered_pct: total ? (answered / total) * 100 : 0,
      fallback_pct: total ? ((total - answered) / total) * 100 : 0,
    },
    recent: recent.map((d) => ({
      ts: d.ts,
      outcome: d.outcome ?? "",
      question: d.question ?? "",
      label: d.label,
      confidence: d.confidence,
    })),
  };
}
