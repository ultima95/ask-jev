#!/usr/bin/env node
/** Nhắc luật hỏi Jev vào mọi phiên, không chỉ khi AskUserQuestion hay skill được nạp. */
import { fileURLToPath } from "node:url";
import { apiKey } from "../lib/jev.mjs";

const key = apiKey();
if (!key) process.exit(0);

const jevPath = fileURLToPath(new URL("../bin/jev.mjs", import.meta.url));

const rule = `Before making any judgement call yourself — classifying, choosing among fixed options, yes/no on evidence, ranking — ask Jev first:
echo '<json>' | node "${jevPath}"
state = the evidence verbatim; criteria = definitions per option/answer as {what, not_for, examples}.
Act on the answer only if confidence >= JEV_ASK_THRESHOLD (default 0.8); below that, ask the user instead.
Never for personal taste or irreversible actions — those go to the user.
Full request format: skill ask-jev.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: rule },
}));
