/** Aggregation trên các dòng JSONL của ask-jev.log. Không dùng fs — nhận text/events thô,
 * để dùng chung được cho cả CLI (đọc file) lẫn plugin server (đọc file khác, có thể watch). */

export function parseEvents(raw) {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
}

export function sinceMsFromSpec(spec) {
  const m = /^(\d+)(h|d)$/.exec(spec ?? "");
  if (!m) return 0;
  return Number(m[1]) * (m[2] === "d" ? 86_400_000 : 3_600_000);
}

export function filterSince(events, sinceMs) {
  return sinceMs ? events.filter((e) => Date.now() - new Date(e.ts).getTime() <= sinceMs) : events;
}

export function computeStats(events) {
  const calls = events.filter((e) => e.kind === "call");
  const decisions = events.filter((e) => e.kind === "decision");
  const latencies = calls.map((c) => c.latency_ms).filter((n) => typeof n === "number").sort((a, b) => a - b);
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const byOutcome = {};
  for (const d of decisions) byOutcome[d.outcome] = (byOutcome[d.outcome] ?? 0) + 1;

  return {
    calls: {
      total: calls.length,
      ok: calls.filter((c) => c.status === "ok").length,
      error: calls.filter((c) => c.status === "error").length,
      avg_latency_ms: avg,
      p95_latency_ms: percentile(latencies, 0.95),
    },
    decisions: { total: decisions.length, by_outcome: byOutcome },
  };
}

/** Newest-first, giới hạn `limit`. */
export function recentDecisions(events, limit = 10) {
  return events
    .filter((e) => e.kind === "decision" && e.question)
    .slice(-limit)
    .reverse();
}
