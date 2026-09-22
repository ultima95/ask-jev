import { readFileSync } from "node:fs";
import { apiKey } from "./jev.mjs";

const DEFAULT_GATES = "permission,stop,bash,prompt";

/** Bật/tắt từng gate qua JEV_GATES (danh sách phẩy); rỗng = tắt hết. Không key = tắt hết. */
export function enabled(name) {
  if (!apiKey()) return false;
  const list = (process.env.JEV_GATES ?? DEFAULT_GATES).split(",").map((s) => s.trim());
  return list.includes(name);
}

export function tailText(s, n) {
  if (typeof s !== "string") return "";
  return s.split("\n").slice(-n).join("\n");
}

export function readStdinJson() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}
