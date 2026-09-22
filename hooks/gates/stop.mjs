#!/usr/bin/env node
/** Stop: Jev chặn dừng sớm khi việc rõ ràng chưa xong. */
import { openSync, closeSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiKey, askJev, logEvent } from "../../lib/jev.mjs";
import { buildState, hasContext } from "../../lib/context.mjs";
import { enabled, readStdinJson } from "../../lib/gate.mjs";

const FOCUS = "Judge using the task, the conversation so far, the workspace state and the exact action; " +
  "the user's original ask is the ground truth for scope.";

// hooks docs (code.claude.com/docs/en/hooks) không có stop_hook_active — tự chặn lặp
// bằng lock file theo session, chỉ ghi khi THỰC SỰ block, để không đè luôn cả những
// lần Stop hợp lệ khác trong 30s đó.
function lockPath(sessionId) {
  return join(tmpdir(), `ask-jev-stop-${sessionId ?? "x"}`);
}
function recentlyBlocked(sessionId) {
  try {
    return Date.now() - statSync(lockPath(sessionId)).mtimeMs < 30_000;
  } catch {
    return false;
  }
}
function markBlocked(sessionId) {
  try {
    unlinkSync(lockPath(sessionId));
  } catch {}
  try {
    closeSync(openSync(lockPath(sessionId), "wx"));
  } catch {}
}

async function main() {
  if (!enabled("stop")) return;
  const input = readStdinJson();
  if (!input || recentlyBlocked(input.session_id)) return;

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
    markBlocked(input.session_id);
    logEvent({ kind: "decision", source: "hook", gate: "stop", outcome: "block", probability: p });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Stop",
        decision: "block",
        reason: `Jev: request looks incomplete (p=${p.toFixed(2)}) — finish it or tell the user what is left.`,
      },
    }));
  } else {
    logEvent({ kind: "decision", source: "hook", gate: "stop", outcome: "ok", probability: p });
  }
}

main().catch(() => {});
