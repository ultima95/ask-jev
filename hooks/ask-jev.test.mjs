import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvents, filterSince, sinceMsFromSpec, recentDecisions } from "../lib/stats.mjs";

const execFileAsync = promisify(execFile);
const transcript = join(mkdtempSync(join(tmpdir(), "askjev-")), "t.jsonl");
writeFileSync(transcript, '{"type":"user","message":{"content":"hi"}}\n{"type":"assistant","message":{"content":"hi"}}\n');
const logFile = join(mkdtempSync(join(tmpdir(), "askjev-log-")), "jev.log");

function stub(handler) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers: handler(JSON.parse(body)) }));
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}
async function runHook(input, url) {
  const child = execFileAsync("node", ["hooks/ask-jev.mjs"], {
    env: { ...process.env, AI_GATEWAY_API_KEY: "dummy", JEV_GATEWAY_URL: url, JEV_LOG_FILE: logFile },
    encoding: "utf8",
  });
  child.child.stdin.end(JSON.stringify(input));
  return JSON.parse((await child).stdout);
}
const opts = [{ label: "A", description: "a" }, { label: "B", description: "b" }];

test("partial answers: resolved question denies, unresolved re-asked", async () => {
  const server = await stub(({ state, questions }) => (questions.pick
    ? { pick: { choice: "o0", probabilities: { o0: state.pendingQuestion === "Resolved?" ? 0.95 : 0.5 } }, personal: { probability: 0.1 } }
    : {}));
  const out = await runHook({
    tool_name: "AskUserQuestion",
    transcript_path: transcript,
    tool_input: { questions: [{ question: "Resolved?", options: opts }, { question: "Unresolved?", options: opts }] },
  }, `http://127.0.0.1:${server.address().port}`);
  server.close();
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /"Resolved\?" → A/);
  assert.match(reason, /Re-ask the user ONLY the unresolved question/);
  assert.match(reason, /"Unresolved\?"/);

  const decisions = readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.kind === "decision");
  assert.ok(decisions.some((d) => d.question === "Resolved?" && d.outcome === "answered" && d.label === "A"));
  assert.ok(decisions.some((d) => d.question === "Unresolved?" && d.outcome === "low_confidence"));

  const { stdout } = await execFileAsync("node", ["bin/jev.mjs", "stats", "--json"], { env: { ...process.env, JEV_LOG_FILE: logFile } });
  const summary = JSON.parse(stdout);
  assert.equal(summary.decisions.by_outcome.answered, decisions.filter((d) => d.outcome === "answered").length);
  assert.equal(summary.decisions.by_outcome.low_confidence, decisions.filter((d) => d.outcome === "low_confidence").length);
});

test("multiSelect: decisive per-option answers join into one label", async () => {
  const server = await stub(() => ({ personal: { probability: 0.1 }, o0: { probability: 0.9 }, o1: { probability: 0.05 } }));
  const out = await runHook({
    tool_name: "AskUserQuestion",
    transcript_path: transcript,
    tool_input: { questions: [{ question: "Pick features", multiSelect: true, options: opts }] },
  }, `http://127.0.0.1:${server.address().port}`);
  server.close();
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /"Pick features" → A \(/);
});

test("lib/stats.mjs: malformed lines skipped, --since filters, recentDecisions caps to newest N", () => {
  const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const now = new Date().toISOString();
  const raw = ["not json", JSON.stringify({ ts: old, kind: "decision", outcome: "answered", question: "Old?" }),
    JSON.stringify({ ts: now, kind: "decision", outcome: "answered", question: "New1?" }),
    JSON.stringify({ ts: now, kind: "decision", outcome: "error", question: "New2?" }), ""].join("\n");

  const events = parseEvents(raw);
  assert.equal(events.length, 3);
  assert.equal(filterSince(events, sinceMsFromSpec("7d")).length, 2);
  const lastOne = recentDecisions(events, 1);
  assert.equal(lastOne.length, 1);
  assert.equal(lastOne[0].question, "New2?");
});
