#!/usr/bin/env node
/** Stop: Jev chặn dừng sớm khi việc rõ ràng chưa xong. */
import { apiKey, askJev, logEvent } from "../../lib/jev.mjs";
import { buildState, hasContext } from "../../lib/context.mjs";
import { enabled, readStdinJson, FOCUS } from "../../lib/gate.mjs";

async function main() {
  if (!enabled("stop")) return;
  const input = readStdinJson();
  // stop_hook_active: true khi Claude Code đang tiếp tục sau lần chính hook này vừa
  // block — bỏ qua để tránh tự lặp vô hạn. Không có trong docs công khai (đã kiểm
  // tra code.claude.com/docs/en/hooks) nhưng có trong hooks reference nội bộ của CLI.
  if (!input || input.stop_hook_active) return;

  const state = buildState({
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    action: { finalAssistantMessage: input.last_assistant_message ?? "" },
  });
  if (!hasContext(state)) return;

  const answers = await askJev(apiKey(), state, {
    incomplete: {
      type: "boolean",
      instructions: { question: "Did the assistant stop with work still owed, instead of fully addressing the user's request?", focus: FOCUS },
      criteria: {
        true: "Promised something not delivered, left a TODO, or ignored part of the request",
        false: "Complete, or explicitly handed back to the user with a question or blocker",
      },
    },
  }, "gate:stop", 4000).catch(() => null);
  if (!answers) return;

  const p = answers.incomplete.probability;
  if (p >= 0.85) {
    logEvent({ kind: "decision", source: "hook", gate: "stop", outcome: "block", probability: p });
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `Jev: request looks incomplete (p=${p.toFixed(2)}) — finish it or tell the user what is left.`,
    }));
  } else {
    logEvent({ kind: "decision", source: "hook", gate: "stop", outcome: "ok", probability: p });
  }
}

main().catch(() => {});
