import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const transcript = join(mkdtempSync(join(tmpdir(), "gates-")), "t.jsonl");
writeFileSync(transcript, '{"type":"user","message":{"content":"please refactor the parser"}}\n{"type":"assistant","message":{"content":"ok"}}\n');
const logFile = join(mkdtempSync(join(tmpdir(), "gates-log-")), "jev.log");

function stub(answers) {
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

async function runGate(name, input, url, gates = name) {
  const child = execFileAsync("node", [`hooks/gates/${name}.mjs`], {
    env: { ...process.env, AI_GATEWAY_API_KEY: "dummy", JEV_GATEWAY_URL: url, JEV_LOG_FILE: logFile, JEV_GATES: gates, JEV_REMIND: "0" },
    encoding: "utf8",
  });
  child.child.stdin.end(JSON.stringify(input));
  return (await child).stdout;
}

const editInput = { tool_name: "Edit", transcript_path: transcript, cwd: process.cwd(), tool_input: { file_path: "a.js" } };
const bashInput = { tool_name: "Bash", transcript_path: transcript, cwd: process.cwd(), tool_input: { command: "npm test" }, tool_response: "1 failing\n" };
const stopInput = { session_id: `stop-${Math.random()}`, transcript_path: transcript, cwd: process.cwd(), last_assistant_message: "done" };
const promptInput = { session_id: "x", prompt: "please refactor the auth module completely", transcript_path: transcript, cwd: process.cwd() };

test("permission gate: allow on p=0.95, ask on p=0.1, silent on p=0.5", async () => {
  for (const [p, decision] of [[0.95, "allow"], [0.1, "ask"], [0.5, null]]) {
    const server = await stub({ safe: { probability: p } });
    const out = await runGate("permission", editInput, `http://127.0.0.1:${server.address().port}`);
    server.close();
    if (decision) assert.match(out, new RegExp(`"permissionDecision":"${decision}"`));
    else assert.equal(out, "");
  }
});

test("stop gate: blocks on p(incomplete)=0.9, then silent on immediate re-stop (loop guard)", async () => {
  const server = await stub({ incomplete: { probability: 0.9 } });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.match(await runGate("stop", stopInput, url), /"decision":"block"/);
  const again = await runGate("stop", stopInput, url);
  server.close();
  assert.equal(again, "");
});

test("bash gate: emits additionalContext for tests_failed", async () => {
  const server = await stub({ result: { choice: "tests_failed", probabilities: { tests_failed: 0.9 } } });
  const out = await runGate("bash", bashInput, `http://127.0.0.1:${server.address().port}`);
  server.close();
  assert.match(out, /Jev: tests_failed/);
});

test("all four gates emit nothing when JEV_GATES= is empty", async () => {
  const server = await stub({ safe: { probability: 0.95 }, incomplete: { probability: 0.95 }, result: { choice: "error", probabilities: { error: 0.95 } } });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [name, input] of [["permission", editInput], ["stop", stopInput], ["bash", bashInput], ["prompt", promptInput]]) {
    assert.equal(await runGate(name, input, url, ""), "");
  }
  server.close();
});
