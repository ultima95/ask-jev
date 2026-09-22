import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AskJevPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  return client.addWorkspacePanel({
    id: "ask-jev",
    title: "Ask Jev",
    icon: "Activity",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: AskJevPanel,
  });
}
