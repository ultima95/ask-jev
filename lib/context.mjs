import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// docs.typesafe.ai/concepts/state không nêu giới hạn kích thước; 60k ký tự là mức
// trần tự chọn, đo bằng bin/jev.mjs stats + một state ~40k ký tự thật (xem README).
const DEFAULT_CAP = 60_000;

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "tool_use") return `[called ${p.name}]`;
      if (p.type === "tool_result") {
        const t = typeof p.content === "string"
          ? p.content
          : Array.isArray(p.content) ? p.content.map((c) => c.text ?? "").join(" ") : "";
        return `[tool result: ${t.slice(0, 300)}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function readRows(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.isSidechain || row.isMeta) continue;
    if (row.type !== "user" && row.type !== "assistant") continue;
    rows.push(row);
  }
  return rows;
}

function readWorkspace(cwd) {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  return {
    branch: run(["branch", "--show-current"]),
    status: run(["status", "--short"]).split("\n").slice(0, 40).join("\n"),
    diffStat: run(["diff", "--stat"]).split("\n").slice(0, 40).join("\n"),
  };
}

/**
 * State đầy đủ Jev cần để phán như một reviewer thật: yêu cầu gốc, hội thoại,
 * trạng thái workspace, và hành động đang xét. Ưu tiên giữ `task` trước, rồi
 * lấp `conversation` bằng phần ngân sách còn lại — workspace/action/extra có
 * kích thước riêng đã bị chặn từ nơi gọi nên tính thẳng vào phần cố định.
 */
export function buildState({ transcriptPath, cwd, action, extra }) {
  const cap = Number(process.env.JEV_STATE_CHARS ?? DEFAULT_CAP);
  const rows = readRows(transcriptPath);
  const firstUserRow = rows.find((r) => r.type === "user");
  const firstUserMessage = firstUserRow ? textOf(firstUserRow.message?.content) : "";

  const turns = rows
    .map((r) => `${r.type === "user" ? "User" : "Claude"}: ${textOf(r.message?.content)}`)
    .filter((t) => !/^(User|Claude): *$/.test(t));
  const latestUserMessage = [...turns].reverse().find((t) => t.startsWith("User: "))?.slice(6) ?? "";

  const workspace = readWorkspace(cwd);
  const fixed = JSON.stringify({ task: { firstUserMessage, latestUserMessage }, workspace, action, extra }).length;
  let budget = Math.max(0, cap - fixed);
  const conversation = [];
  for (let i = turns.length - 1; i >= 0 && budget > 0; i--) {
    if (turns[i].length > budget) break;
    conversation.unshift(turns[i]);
    budget -= turns[i].length;
  }

  const state = { task: { firstUserMessage, latestUserMessage }, conversation, workspace };
  if (action) state.action = action;
  if (extra) state.extra = extra;
  return state;
}

export function hasContext(state) {
  return Boolean(state.task.firstUserMessage || state.task.latestUserMessage || state.conversation.length > 0);
}
