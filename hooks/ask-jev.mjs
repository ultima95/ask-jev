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
 * Câu hỏi `personal` dùng chung cho cả single-pick lẫn multiSelect: câu hỏi này
 * có được phép tự quyết hay không.
 *
 * Thiếu nó, Jev sẽ tự tin chọn giúp bạn cả tông màu thương hiệu lẫn việc xoá
 * thư mục — sai không phải về sự thật mà về thẩm quyền. Ranh giới đó phải do
 * chính nó nhận ra, vì chỉ nó đọc được câu hỏi.
 */
const PERSONAL_QUESTION = {
  type: "boolean",
  instructions: {
    question: "Is `pendingQuestion` something only the user has standing to answer?",
    focus: "A matter of personal taste, aesthetics, private priorities, or an irreversible consequence.",
  },
  criteria: {
    true: "Personal preference, aesthetic choice, a trade-off that depends on private goals, or deleting/sending/publishing something that cannot be undone",
    false: "There is a correct answer derivable from `conversationContext`, established convention, or technical fact",
  },
};

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
      personal: PERSONAL_QUESTION,
    },
  );

  if (answers.personal.probability > 0.5) return null;
  const confidence = answers.pick.probabilities?.[answers.pick.choice] ?? 1;
  if (confidence < THRESHOLD) return null;

  return { label: options[Number.parseInt(answers.pick.choice.slice(1), 10)]?.label, confidence };
}

/**
 * multiSelect: không có một "phương án đúng" duy nhất, nên mỗi option là một câu
 * hỏi boolean riêng — có áp dụng hay không. Chỉ giải quyết khi MỌI option đều dứt
 * khoát (>= THRESHOLD hoặc <= 1-THRESHOLD); còn một option lửng lơ ở giữa thì cả
 * câu hỏi coi như chưa giải quyết được, để người quyết.
 */
async function decideMulti(key, { question, options, context }) {
  if (options.length < 2) return null;

  const questions = { personal: PERSONAL_QUESTION };
  options.forEach((o, i) => {
    questions[`o${i}`] = {
      type: "boolean",
      instructions: {
        question: `${question} — does this option apply?`,
        focus: `Judge only whether "${o.label}" applies, independent of the other options.`,
      },
      criteria: {
        true: `${o.label} — ${o.description}`,
        false: `Does not apply: ${o.label} — ${o.description} is not the case`,
      },
    };
  });

  const answers = await askJev(key, { conversationContext: context, pendingQuestion: question }, questions);

  if (answers.personal.probability > 0.5) return null;

  const selected = [];
  let confidence = 1;
  for (let i = 0; i < options.length; i++) {
    const p = answers[`o${i}`]?.probability;
    if (p === undefined) return null;
    if (p >= THRESHOLD) {
      selected.push(options[i].label);
      confidence = Math.min(confidence, p);
    } else if (p <= 1 - THRESHOLD) {
      confidence = Math.min(confidence, 1 - p);
    } else {
      return null;
    }
  }

  return { label: selected.length > 0 ? selected.join(", ") : "none", confidence };
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
    questions.map((q) => {
      const fn = q.multiSelect ? decideMulti : decide;
      return fn(key, { question: q.question, options: q.options ?? [], context }).catch(() => null);
    }),
  );

  // Trả lời từng câu một, không phải tất-cả-hoặc-không-gì: câu nào Jev chắc thì
  // dùng luôn, câu nào không thì bảo Claude chỉ hỏi lại đúng câu đó — người dùng
  // không mất những lựa chọn Jev đã chắc chỉ vì một câu khác còn mập mờ.
  const resolved = questions
    .map((q, i) => (results[i]?.label ? { question: q.question, ...results[i] } : null))
    .filter(Boolean);
  if (resolved.length === 0) return;

  const answered = resolved
    .map((r) => `"${r.question}" → ${r.label} (Jev: ${r.confidence.toFixed(2)})`)
    .join("\n");
  const unresolved = questions.filter((_, i) => !results[i]?.label).map((q) => `"${q.question}"`);

  const reason = unresolved.length === 0
    ? `Jev answered on the user's behalf from conversation context. Do NOT ask again — use these choices and continue:\n${answered}`
    : `Jev answered some of these on the user's behalf from conversation context. Use these, do not re-ask them:\n` +
      `${answered}\n\nRe-ask the user ONLY the unresolved question(s):\n${unresolved.join("\n")}`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
      systemMessage: `Jev answered: ${resolved.map((r) => r.label).join(", ")}`,
    },
  }));
}

// Mọi lỗi đều im lặng: hook này chỉ được phép bớt việc cho người, không bao giờ
// được chặn họ trả lời.
main().catch(() => {});
