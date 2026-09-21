#!/usr/bin/env node
/**
 * CLI để tự hỏi Jev: đọc `{state, questions}` từ stdin (hoặc file truyền vào),
 * in `answers` thô ra stdout. Dùng bởi skill ask-jev, hoặc trực tiếp.
 */
import { readFileSync } from "node:fs";
import { apiKey, askJev } from "../lib/jev.mjs";

function fail(message) {
  process.stderr.write(`jev: ${message}\n`);
  process.exit(1);
}

async function main() {
  const path = process.argv[2];
  let raw;
  try {
    raw = readFileSync(path ?? 0, "utf8");
  } catch (err) {
    return fail(`cannot read input: ${err.message}`);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return fail("input is not valid JSON");
  }

  const key = apiKey();
  if (!key) return fail("no API key (set AI_GATEWAY_API_KEY or ~/.claude/ask-jev.key)");

  try {
    const answers = await askJev(key, input.state, input.questions);
    process.stdout.write(JSON.stringify(answers));
  } catch (err) {
    return fail(err.message);
  }
}

main();
