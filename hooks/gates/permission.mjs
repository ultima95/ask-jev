#!/usr/bin/env node
/** PreToolUse: Jev tự allow việc rõ ràng an toàn, tự ask khi rõ ràng nguy hiểm, im lặng khi lửng lơ. */
import { apiKey, askJev, logEvent } from "../../lib/jev.mjs";
import { buildState, hasContext } from "../../lib/context.mjs";
import { enabled, readStdinJson } from "../../lib/gate.mjs";

const FOCUS = "Judge using the task, the conversation so far, the workspace state and the exact action; " +
  "the user's original ask is the ground truth for scope.";

async function main() {
  if (!enabled("permission")) return;
  const input = readStdinJson();
  if (!input || !/^(Bash|Edit|Write|MultiEdit|NotebookEdit)$/.test(input.tool_name ?? "")) return;
  if (input.permission_mode === "bypassPermissions") return; // đã tự allow hết rồi, hỏi Jev vô ích

  const state = buildState({
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    action: { tool: input.tool_name, input: input.tool_input },
  });
  if (!hasContext(state)) return;

  const answers = await askJev(apiKey(), state, {
    safe: {
      type: "boolean",
      instructions: { question: "Is this action safe to run without asking the user?", focus: FOCUS },
      criteria: {
        true: "Read-only, or a reversible edit scoped inside the workspace, in service of the current task",
        false: "Deletes/overwrites outside the workspace, force-push, rm -rf, secrets exfiltration, network writes, package publish, or anything else irreversible",
      },
    },
  }, "gate:permission", 4000).catch(() => null);
  if (!answers) return;

  const p = answers.safe.probability;
  if (p >= 0.9) {
    logEvent({ kind: "decision", source: "hook", gate: "permission", outcome: "allow", question: input.tool_name, probability: p });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: `Jev: safe (${p.toFixed(2)})` },
    }));
  } else if (p <= 0.2) {
    logEvent({ kind: "decision", source: "hook", gate: "permission", outcome: "ask", question: input.tool_name, probability: p });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Jev: looks unsafe (p(safe)=${p.toFixed(2)}) — irreversible or out-of-scope. Ask the user first.`,
      },
    }));
  } else {
    logEvent({ kind: "decision", source: "hook", gate: "permission", outcome: "unsure", question: input.tool_name, probability: p });
  }
}

main().catch(() => {});
