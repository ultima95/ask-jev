---
name: ask-jev
description: Use whenever you are about to make a judgement call that isn't yours to invent — classify something, pick between a fixed set of options, answer a yes/no question, or rate something on a scale — and the answer follows from context you already have. Not for personal taste, style choices, or irreversible actions; those go to the user.
---

# Ask Jev

Jev (typesafe.ai) is a small, fast evaluation model. Given evidence and a
definition of what each answer means, it returns a calibrated probability —
not text, not an excuse. Consult it instead of silently deciding, and
instead of interrupting the user for something they didn't need to be asked.

## When to ask

Ask Jev when:
- classifying content ("is this a bug report or a feature request")
- picking between a fixed set of options where the right one follows from
  evidence already in hand
- a yes/no check with an observable answer ("does this diff touch auth code")

Go straight to the user instead when the choice is personal taste, style, or
irreversible (delete, send, publish, spend money). No evidence yet? Go get
it first — Jev doesn't research, it only judges what you hand it.

## How to build a good request

One JSON object: `{ state, questions }`.

- **state** — the evidence, verbatim. Paste the actual text/diff/message
  being judged, never a summary. Use a plain object with descriptive field
  names when there's more than one part (`{ diff, commitMessage }`, not
  `{ x, y }`).
- **questions** — a map of question name → question. One coherent judgement
  per question; several independent judgements go in the same call as
  separate entries, not chained calls and not one combined question.
- **instructions** — `{ question, focus }`. `question` is the complete
  judgement in one sentence; `focus` narrows what to weigh or ignore.
  Reference state fields with backticks, e.g. `` `diff` ``.
- **criteria** — what each answer means. This decides whether the
  probability is worth anything:
  - `choice` — one entry per option: `{ what, not_for, examples }`. `what`
    is the definition. `not_for` names the sibling options it must not be
    confused with, stated on every option. `examples` is 1–3 short concrete
    instances.
  - `boolean` (yes/no; typesafe.ai's docs call this primitive "noul") —
    `{ true: "...", false: "..." }`, each a full definition, not just the word.

Every definition must be **observable** (checkable directly against `state`,
not inferred) and **mutually exclusive** (no other option's definition could
also be true at once).

## Examples

Yes/no:

```json
{
  "state": { "item": "Two beef patties, cheese, and pickles between a sesame bun." },
  "questions": {
    "isHamburger": {
      "type": "boolean",
      "instructions": { "question": "Does `item` match the definition of a hamburger?", "focus": "Judge the food itself, not what it's called." },
      "criteria": {
        "true": "A hot sandwich: a cooked ground-meat patty inside a sliced bun",
        "false": "Anything else — a cold sandwich, a non-ground protein, no bun, or not a sandwich at all"
      }
    }
  }
}
```

Choice:

```json
{
  "state": { "ticket": "Customer says the app crashes on launch after the update." },
  "questions": {
    "category": {
      "type": "choice",
      "instructions": { "question": "Which category does `ticket` belong to?", "focus": "Classify what's reported, not how urgent it sounds." },
      "criteria": {
        "bug": { "what": "A defect in existing behavior — something that used to work and now doesn't", "not_for": "feature_request, question", "examples": ["app crashes on launch"] },
        "feature_request": { "what": "A request for new behavior that never existed", "not_for": "bug, question", "examples": ["please add dark mode"] },
        "question": { "what": "The customer wants to understand something, no defect implied", "not_for": "bug, feature_request", "examples": ["how do I export my data"] }
      }
    }
  }
}
```

## How to call it

```
echo '<json above>' | node "${CLAUDE_PLUGIN_ROOT}/bin/jev.mjs"
```

Prints the raw `answers` object to stdout, or exits non-zero with a one-line
stderr message (no key, malformed input, gateway error, timeout).

## Reading the result

- `choice`: `{ choice: "bug", probabilities: { bug: 0.94, ... }, confidence: 0.9 }`.
- `boolean`: `{ probability: 0.97, confidence: 0.95 }` — probability of "true".
- `confidence` is separate from probability: it summarizes how concentrated
  the distribution is, not correctness. Threshold on it — reuse
  `JEV_ASK_THRESHOLD` (default `0.8`); below it, ask the user or gather more
  evidence instead of acting.

## Anti-patterns

- A criterion that's just the option's label ("Yes", "bug") with no
  definition — nothing to judge against.
- Two options whose definitions overlap, or that don't name each other in
  `not_for`.
- Summarizing the evidence into `state` instead of pasting it verbatim.
- Bundling several independent judgements into one `question` instead of
  decomposing them into separate entries.

To see how often Jev is actually being consulted: `node "${CLAUDE_PLUGIN_ROOT}/bin/jev.mjs" stats`.
