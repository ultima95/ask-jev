import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const SINCE_OPTIONS = ["24h", "7d", "all"] as const;
export type SinceOption = (typeof SINCE_OPTIONS)[number];

export const DecisionEventSchema = z.object({
  ts: z.string(),
  outcome: z.string(),
  question: z.string(),
  label: z.string().optional(),
  confidence: z.number().optional(),
});

export const jevStatsRpc = defineRpc({
  name: "ask-jev.stats",
  input: z.object({
    since: z.enum(SINCE_OPTIONS).default("all"),
    outcome: z.string().default("all"),
  }),
  output: z.object({
    logPath: z.string(),
    hasLog: z.boolean(),
    calls: z.object({
      total: z.number(),
      ok: z.number(),
      error: z.number(),
      avg_latency_ms: z.number(),
      p95_latency_ms: z.number(),
    }),
    decisions: z.object({
      total: z.number(),
      by_outcome: z.record(z.string(), z.number()),
      answered_pct: z.number(),
      fallback_pct: z.number(),
    }),
    recent: z.array(DecisionEventSchema),
  }),
});

export type JevStats = z.infer<typeof jevStatsRpc.output>;
