import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { jevStatsRpc, SINCE_OPTIONS, type JevStats, type SinceOption } from "../shared/contracts";

const POLL_MS = 2000;

export function AskJevPanel({ theme, layout }: PluginWorkspacePanelProps) {
  const fetchStats = useRpc(jevStatsRpc);
  const [since, setSince] = useState<SinceOption>("all");
  const [outcome, setOutcome] = useState("all");
  const [stats, setStats] = useState<JevStats | null>(null);
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);

  const load = useCallback(() => {
    fetchStats({ since, outcome }).then(setStats).catch(() => {});
  }, [fetchStats, since, outcome]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!stats) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (!stats.hasLog) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>No log yet at {stats.logPath}</Text>
      </View>
    );
  }

  const outcomes = Object.keys(stats.decisions.by_outcome);

  return (
    <View style={styles.screen}>
      <View style={styles.tiles}>
        <Tile styles={styles} label="Calls" value={String(stats.calls.total)} />
        <Tile styles={styles} label="Answered" value={`${stats.decisions.answered_pct.toFixed(0)}%`} />
        <Tile styles={styles} label="Fell back to user" value={`${stats.decisions.fallback_pct.toFixed(0)}%`} />
        <Tile styles={styles} label="Avg / p95 latency" value={`${stats.calls.avg_latency_ms}ms / ${stats.calls.p95_latency_ms}ms`} />
      </View>

      <View style={styles.row}>
        {SINCE_OPTIONS.map((opt) => (
          <Chip key={opt} styles={styles} active={since === opt} label={opt === "all" ? "All time" : opt} onPress={() => setSince(opt)} />
        ))}
      </View>

      <View style={styles.row}>
        <Chip styles={styles} active={outcome === "all"} label="All outcomes" onPress={() => setOutcome("all")} />
        {outcomes.map((o) => (
          <Chip
            key={o}
            styles={styles}
            active={outcome === o}
            label={`${o} (${stats.decisions.by_outcome[o]})`}
            onPress={() => setOutcome(o)}
          />
        ))}
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.cell, styles.colTime]}>Time</Text>
        <Text style={[styles.cell, styles.colOutcome]}>Outcome</Text>
        <Text style={[styles.cell, styles.colQuestion]}>Question</Text>
        <Text style={[styles.cell, styles.colLabel]}>Label</Text>
      </View>
      <FlatList
        data={stats.recent}
        keyExtractor={(item, i) => `${item.ts}-${i}`}
        style={styles.table}
        renderItem={({ item }) => (
          <View style={styles.tableRow}>
            <Text style={[styles.cell, styles.colTime, styles.muted]}>{formatTime(item.ts)}</Text>
            <Text style={[styles.cell, styles.colOutcome, { color: outcomeColor(theme, item.outcome) }]}>{item.outcome}</Text>
            <Text style={[styles.cell, styles.colQuestion]} numberOfLines={1}>
              {item.question}
            </Text>
            <Text style={[styles.cell, styles.colLabel]} numberOfLines={1}>
              {item.label ? `${item.label}${item.confidence != null ? ` (${item.confidence.toFixed(2)})` : ""}` : "—"}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>No decisions in range.</Text>}
      />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Tile({ styles, label, value }: { styles: Styles; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Chip({ styles, active, label, onPress }: { styles: Styles; active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function outcomeColor(theme: PluginTheme, outcome: string): string {
  if (outcome === "answered") return theme.colors.statusSuccess;
  if (outcome === "error" || outcome === "no_key") return theme.colors.statusDanger;
  return theme.colors.statusWarning;
}

function makeStyles(theme: PluginTheme, compact: boolean) {
  const pad = compact ? 12 : 16;
  return {
    screen: { flex: 1, padding: pad, backgroundColor: theme.colors.surface0, gap: 12 },
    tiles: { flexDirection: "row" as const, gap: 8, flexWrap: "wrap" as const },
    tile: {
      flexGrow: 1,
      minWidth: 120,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
    },
    tileValue: { fontSize: 20, fontWeight: "600" as const, color: theme.colors.foreground },
    tileLabel: { fontSize: 12, color: theme.colors.foregroundMuted, marginTop: 2 },
    row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
    chip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    chipText: { fontSize: 12, color: theme.colors.foreground },
    chipTextActive: { color: theme.colors.accentForeground },
    table: { flex: 1 },
    tableHeader: {
      flexDirection: "row" as const,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 6,
    },
    tableRow: {
      flexDirection: "row" as const,
      borderBottomWidth: 1,
      borderColor: theme.colors.surface2,
      paddingVertical: 6,
    },
    cell: { fontSize: 12, color: theme.colors.foreground, paddingHorizontal: 4 },
    colTime: { width: compact ? 100 : 150 },
    colOutcome: { width: 110 },
    colQuestion: { flex: 1 },
    colLabel: { width: compact ? 110 : 160 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
  };
}
