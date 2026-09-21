import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GATEWAY = process.env.JEV_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v4/ai/evaluation-model";
const MODEL = process.env.JEV_MODEL ?? "typesafe-ai/jev";
const TIMEOUT_MS = 8_000;

/** Khoá: biến môi trường trước, rồi tới file — để không phải nhét secret vào settings.json. */
export function apiKey() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY.trim();
  for (const name of ["ask-jev.key", "jev-ask.key"]) {
    try {
      const key = readFileSync(join(homedir(), ".claude", name), "utf8").trim();
      if (key) return key;
    } catch {
      // thử tên kế tiếp
    }
  }
  return null;
}

export async function askJev(key, state, questions) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "ai-gateway-protocol-version": "0.0.1",
      "ai-evaluation-model-specification-version": "4",
      "ai-model-id": MODEL,
    },
    body: JSON.stringify({ state, questions }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  return (await res.json()).answers;
}
