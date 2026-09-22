import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AskJevPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "ask-jev",
    title: "Ask Jev",
    icon: "Activity",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: AskJevPanel,
  });

  // addWorkspacePanel alone isn't Cmd+K searchable — Command Center only indexes
  // addCommandCenterItem entries, so the panel needs one to be discoverable.
  const removeCommand = client.addCommandCenterItem({
    id: "open-ask-jev",
    title: "Ask Jev: usage log",
    icon: "Activity",
    keywords: ["jev", "ask-jev", "usage", "stats", "decisions", "log"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("ask-jev");
    },
  });

  return () => {
    removePanel();
    removeCommand();
  };
}
