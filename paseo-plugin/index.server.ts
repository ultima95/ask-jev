import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getStats } from "./server/log";
import { jevStatsRpc } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  server.handle(jevStatsRpc, (input) => getStats(input));
  return () => {};
}
