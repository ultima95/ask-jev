#!/usr/bin/env node
/**
 * Hỏi Jev trước khi hỏi người.
 *
 * Chặn AskUserQuestion, đưa câu hỏi + ngữ cảnh phiên cho Jev (typesafe.ai, model
 * đánh giá trả xác suất). Đủ chắc và không phải chuyện riêng của người dùng thì
 * trả lời thay, còn lại để câu hỏi đi tiếp bình thường.
 *
 * Claude Code không cho hook trả về tool result giả, nhưng permissionDecision
 * "deny" thì permissionDecisionReason được đưa ngược vào model — nên "trả lời"
 * ở đây = chặn câu hỏi + nói cho model biết đáp án.
 *
 * Không phụ thuộc npm: chỉ fetch + fs của Node.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GATEWAY = process.env.JEV_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v4/ai/evaluation-model";
const MODEL = process.env.JEV_MODEL ?? "typesafe-ai/jev";
const THRESHOLD = Number(process.env.JEV_ASK_THRESHOLD ?? 0.8);
const TIMEOUT_MS = 8_000;
const CONTEXT_TURNS = 12;
const CONTEXT_CHARS = 6_000;

/** Khoá: biến môi trường trước, rồi tới file — để không phải nhét secret vào settings.json. */
function apiKey() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY.trim();
  try {
    return readFileSync(join(homedir(), ".claude", "jev-ask.key"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

async function askJev(key, state, questions) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "ai-gateway-protocol-version": "0.0.1",
      "ai-evaluation-model-specification-version": "4",
      "ai-model-id": MODEL,
    },
    body: JSON.stringify({ state, questions }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  return (await res.json()).answers;
}

/**
 * Hai câu hỏi, không phải một. `pick` nói phương án nào đúng; `personal` nói câu
 * hỏi này có được phép tự quyết hay không.
 *
 * Thiếu `personal`, Jev sẽ tự tin chọn giúp bạn cả tông màu thương hiệu lẫn việc
 * xoá thư mục — sai không phải về sự thật mà về thẩm quyền. Ranh giới đó phải do
 * chính nó nhận ra, vì chỉ nó đọc được câu hỏi.
 */
async function decide(key, { question, options, context }) {
  if (options.length < 2) return null;

  const criteria = Object.fromEntries(
    options.map((o, i) => [`o${i}`, o.description ? `${o.label} — ${o.description}` : o.label]),
  );

  const answers = await askJev(key, { context, question, options: criteria }, {
    pick: {
      type: "choice",
      instructions:
        "Given the context, which option answers the question? Choose what the user themselves would choose.",
      criteria,
    },
    personal: {
      type: "boolean",
      instructions:
        "Is this question a matter of personal taste, aesthetics, private priorities, or an irreversible consequence — something only the user has standing to answer?",
      criteria: {
        true: "Personal preference, aesthetic choice, a trade-off that depends on private goals, or deleting/sending/publishing something that cannot be undone",
        false: "There is a correct answer derivable from the context, established convention, or technical fact",
      },
    },
  });

  if (answers.personal.probability > 0.5) return null;
  const confidence = answers.pick.probabilities?.[answers.pick.choice] ?? 1;
  if (confidence < THRESHOLD) return null;

  return { label: options[Number.parseInt(answers.pick.choice.slice(1), 10)]?.label, confidence };
}

/** Vài lượt gần nhất. Bỏ lượt subagent và lượt máy sinh — chúng nói chuyện nội bộ. */
function loadContext(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return "";
  }

  const turns = [];
  for (let i = lines.length - 1; i >= 0 && turns.length < CONTEXT_TURNS; i--) {
    if (!lines[i].trim()) continue;
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (row.isSidechain || row.isMeta) continue;
    if (row.type !== "user" && row.type !== "assistant") continue;

    const c = row.message?.content;
    const text = typeof c === "string"
      ? c
      : Array.isArray(c) ? c.filter((p) => p.type === "text").map((p) => p.text).join("\n") : "";
    if (text.trim()) turns.unshift(`${row.type === "user" ? "User" : "Claude"}: ${text.trim()}`);
  }
  return turns.join("\n\n").slice(-CONTEXT_CHARS);
}

async function main() {
  const key = apiKey();
  if (!key) return;

  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (input.tool_name !== "AskUserQuestion") return;

  const questions = input.tool_input?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return;
  // Chọn nhiều đáp án: một lựa chọn sai kéo theo cả chùm, để người quyết.
  if (questions.some((q) => q.multiSelect)) return;

  const context = loadContext(input.transcript_path ?? "");
  if (!context) return;

  const results = await Promise.all(
    questions.map((q) =>
      decide(key, { question: q.question, options: q.options ?? [], context }).catch(() => null),
    ),
  );

  // Tất cả hoặc không gì: trả lời nửa chừng thì model vẫn phải hỏi lại, mà người
  // dùng đã mất một lựa chọn vào tay Jev.
  if (results.some((r) => !r?.label)) return;

  const answer = questions
    .map((q, i) => `"${q.question}" → ${results[i].label} (Jev: ${results[i].confidence.toFixed(2)})`)
    .join("\n");

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Jev answered on the user's behalf from conversation context. Do NOT ask again — use these choices and continue:\n${answer}`,
      systemMessage: `Jev answered: ${results.map((r) => r.label).join(", ")}`,
    },
  }));
}

// Mọi lỗi đều im lặng: hook này chỉ được phép bớt việc cho người, không bao giờ
// được chặn họ trả lời.
main().catch(() => {});
