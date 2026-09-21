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
import { apiKey, askJev } from "../lib/jev.mjs";

const THRESHOLD = Number(process.env.JEV_ASK_THRESHOLD ?? 0.8);
const CONTEXT_TURNS = 12;
const CONTEXT_CHARS = 6_000;

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

  // main() đã chặn description rỗng, nên ở đây description luôn có sẵn.
  // criteria dạng {what, not_for} và instructions dạng {question, focus} theo
  // docs.typesafe.ai/primitives/choice — not_for nêu tên các lựa chọn khác để
  // ép tính loại trừ lẫn nhau, chứ không chỉ liệt kê định nghĩa rời rạc.
  const criteria = Object.fromEntries(
    options.map((o, i) => [
      `o${i}`,
      {
        what: `${o.label} — ${o.description}`,
        not_for: options.filter((_, j) => j !== i).map((other) => other.label).join(", "),
      },
    ]),
  );

  // docs.typesafe.ai/concepts/state: state là nội dung để đánh giá, tách khỏi câu
  // hỏi (judgment) nằm trong instructions; mỗi phần đặt tên rõ để giữ quan hệ.
  const answers = await askJev(
    key,
    { conversationContext: context, pendingQuestion: question, answerOptions: criteria },
    {
      pick: {
        type: "choice",
        instructions: {
          question: "Given `conversationContext`, which option answers `pendingQuestion`?",
          focus:
            "Each option's `what` in `answerOptions` is its definition, `not_for` is what it must not overlap with. Choose what the user themselves would choose.",
        },
        criteria,
      },
      personal: {
        type: "boolean",
        instructions: {
          question: "Is `pendingQuestion` something only the user has standing to answer?",
          focus: "A matter of personal taste, aesthetics, private priorities, or an irreversible consequence.",
        },
        criteria: {
          true: "Personal preference, aesthetic choice, a trade-off that depends on private goals, or deleting/sending/publishing something that cannot be undone",
          false: "There is a correct answer derivable from `conversationContext`, established convention, or technical fact",
        },
      },
    },
  );

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

  // Jev chấm theo criteria; nhãn trần không có description thì không phải criterion.
  const missing = questions.flatMap((q) =>
    (q.options ?? [])
      .filter((o) => !o.description || !o.description.trim())
      .map((o) => `"${q.question}" → option "${o.label}"`),
  );
  if (missing.length > 0) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Every option needs a description that DEFINES it — that's the criterion Jev scores a probability against, a bare " +
          "label is not one. A usable definition is observable (checkable directly against the conversation, not inferred) and " +
          "mutually exclusive (it could not also describe a different option) — otherwise the probability is meaningless. " +
          'Example: question "Is this a hamburger?" → option "Yes" needs a description like "A hot sandwich: cooked ground-meat ' +
          'patty inside a sliced bun" — checkable, and clearly not what "No" would also satisfy — not just "Yes". ' +
          `Re-ask the same question(s) with every option carrying a definition like that. Missing definitions:\n${missing.join("\n")}`,
        systemMessage: "Jev: options need definitions — asking again",
      },
    }));
    return;
  }

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
