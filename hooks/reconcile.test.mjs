import { test } from "node:test";
import assert from "node:assert/strict";
import { withMirrors, reconcile } from "../lib/jev.mjs";

// safe:true → phía an toàn là p CAO (vd incomplete: block cần p>=0.85).
const hiSafe = { incomplete: { type: "boolean", safe: true, instructions: { question: "done?" }, criteria: { true: "owed", false: "complete" } } };
// safe:false → phía an toàn là p THẤP (vd permission safe: allow cần p cao, nên thấp = giữ an toàn).
const loSafe = { safe: { type: "boolean", safe: false, instructions: { question: "ok?" }, criteria: { true: "safe", false: "risky" } } };
// không marker → s=0.5 (vd o0/o1 của multiSelect: mâu thuẫn về giữa = vùng hỏi).
const noMark = { o0: { type: "boolean", instructions: { question: "apply?" }, criteria: { true: "yes", false: "no" } } };

test("withMirrors adds an H0 twin per boolean, swaps criteria, strips the safe marker", () => {
  const sent = withMirrors(hiSafe);
  assert.equal(Object.keys(sent).length, 2);
  assert.equal(sent.incomplete.safe, undefined, "safe marker must not be sent to the API");
  assert.equal(sent.incomplete__mirror.safe, undefined);
  assert.deepEqual(sent.incomplete__mirror.criteria, { true: "complete", false: "owed" });
  assert.match(sent.incomplete__mirror.instructions.question, /Null hypothesis/);
});

test("choice questions are left unmirrored and untouched", () => {
  const q = { pick: { type: "choice", instructions: {}, criteria: { a: {}, b: {} } } };
  assert.deepEqual(Object.keys(withMirrors(q)), ["pick"]);
});

test("agreement keeps confidence high → decision stands (act)", () => {
  const out = reconcile(hiSafe, { incomplete: { probability: 0.9 }, incomplete__mirror: { probability: 0.1 } });
  assert.ok(out.incomplete.probability >= 0.85, `expected >=0.85, got ${out.incomplete.probability}`);
  assert.equal(out.incomplete__mirror, undefined); // twin bị bỏ, shape giữ nguyên
});

// safe:true — mâu thuẫn phải kéo LÊN phía an toàn (block), KHÔNG về 0.5 (nơi block bị đánh mất).
test("safe:true — contradiction pushes toward the high safe side, block survives", () => {
  const out = reconcile(hiSafe, { incomplete: { probability: 0.9 }, incomplete__mirror: { probability: 1.0 } });
  assert.ok(out.incomplete.probability >= 0.85, `expected >=0.85 (still blocks), got ${out.incomplete.probability}`);
});

// safe:false — mâu thuẫn phải kéo XUỐNG phía an toàn (không allow), KHÔNG về 0.5.
test("safe:false — contradiction pushes toward the low safe side, allow is denied", () => {
  const out = reconcile(loSafe, { safe: { probability: 0.9 }, safe__mirror: { probability: 1.0 } });
  assert.ok(out.safe.probability < 0.3, `expected <0.3 (no auto-allow), got ${out.safe.probability}`);
});

// safe:false, đồng thuận cao → không overcorrect: allow vẫn được phép.
test("safe:false — agreement leaves a confident allow intact (no overcorrection)", () => {
  const out = reconcile(loSafe, { safe: { probability: 0.9 }, safe__mirror: { probability: 0.1 } });
  assert.ok(out.safe.probability >= 0.85, `expected >=0.85, got ${out.safe.probability}`);
});

// không marker → mâu thuẫn về đúng giữa (vùng hỏi của multiSelect).
test("unmarked — contradiction collapses to ~0.5 (ask band)", () => {
  const out = reconcile(noMark, { o0: { probability: 0.9 }, o0__mirror: { probability: 0.9 } });
  assert.ok(Math.abs(out.o0.probability - 0.5) < 1e-9, `expected 0.5, got ${out.o0.probability}`);
});

test("missing twin falls back to forward probability unchanged", () => {
  const out = reconcile(hiSafe, { incomplete: { probability: 0.9 } });
  assert.equal(out.incomplete.probability, 0.9);
});

test("choice answers pass through reconcile untouched", () => {
  const q = { pick: { type: "choice" } };
  const ans = { pick: { choice: "a", probabilities: { a: 0.9, b: 0.1 } } };
  assert.deepEqual(reconcile(q, ans), ans);
});
