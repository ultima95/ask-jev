#!/usr/bin/env node
/** Nhắc luật hỏi Jev vào MỖI lượt, không chỉ đầu phiên — model hay quên sau vài lượt. */
import { fileURLToPath } from "node:url";
import { apiKey } from "../lib/jev.mjs";

if (process.env.JEV_REMIND === "0") process.exit(0);
if (!apiKey()) process.exit(0);

const jevPath = fileURLToPath(new URL("../bin/jev.mjs", import.meta.url));
const line = `Reminder: before classifying / choosing among options / yes-no on evidence, ask Jev: echo '<json>' | node "${jevPath}" (skill ask-jev). Personal taste or irreversible actions → ask the user.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: line },
}));
