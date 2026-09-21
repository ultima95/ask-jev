<p align="center"><img src="./assets/logo.jpg" alt="ask-jev logo" width="200"></p>

<h1 align="center">ask-jev</h1>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-2dd4bf?style=flat-square">
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-1abc9c?style=flat-square">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-none-2dd4bf?style=flat-square">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-1abc9c?style=flat-square">
</p>

<p align="center"><strong>English</strong> · <a href="./README.vi.md">Tiếng Việt</a></p>

Ask [Jev](https://typesafe.ai) before asking you.

Claude Code stops to ask you (`AskUserQuestion`) even when the answer is already
sitting in the conversation. This plugin intercepts that question, hands it to
Jev — an evaluation model that returns probabilities instead of prose — and
answers it when the answer is derivable.

Questions that are actually yours still reach you.

```
"Which date library should we use?"        → picks date-fns (1.00)   — already in package.json
"Package this as a plugin or a skill?"     → picks Plugin   (0.95)
"Which colour palette do you want?"        → asks you                — taste
"Delete the three stale environments?"     → asks you                — irreversible
```

## Install

```
/plugin marketplace add yanmad27/ask-jev
/plugin install ask-jev@ask-jev
```

Then set a Vercel AI Gateway key (Jev is in its model catalogue):

```bash
echo 'vck_...' > ~/.claude/ask-jev.key && chmod 600 ~/.claude/ask-jev.key
```

Or use the `AI_GATEWAY_API_KEY` environment variable if you already have one.

No key = the plugin sits still and Claude Code asks you as usual.

## How it decides

Each question becomes **one** Jev request carrying **two** questions:

- `pick` — which option is right, with the full probability distribution
- `personal` — *is this question mine to answer at all?*

The second one is the important half. Without it, Jev will confidently pick your
brand colour and confirm your directory deletion — wrong not about facts but
about standing. `personal` blocks taste, trade-offs that depend on private
goals, and anything irreversible, even when `pick` is certain.

For `pick` to mean anything, every option needs a description that **defines**
it — that's the criterion Jev scores against, not the label. "Is this a
hamburger?" with an option just labelled "Yes" gives Jev nothing to judge;
"Yes" needs a description like "A hot sandwich: cooked ground-meat patty
inside a sliced bun". If any option is missing one, Claude Code never reaches
Jev — the question is bounced straight back to Claude with instructions to
re-ask with definitions added. Nothing reaches you in that round.

Under the hood each option is sent as `{what, not_for}` — `not_for` names the
sibling options it must not overlap with, so the definitions rule each other
out instead of just sitting side by side.

## When it stays silent

| Condition | Why |
|---|---|
| `personal > 0.5` | your call, not the model's |
| confidence `< JEV_ASK_THRESHOLD` | guessing is worse than asking |
| `multiSelect` question | one wrong pick drags the whole set with it |
| several questions, only some confident | a half answer still forces the question again, and you already lost one choice |
| an option has no description | a bare label isn't a criterion — sent back to Claude to re-ask with definitions, not forwarded to Jev |
| no key / Jev errors / over 8s | a broken helper must never block you from answering |

## Configuration

| Variable | Default | |
|---|---|---|
| `AI_GATEWAY_API_KEY` | `~/.claude/ask-jev.key` | Vercel AI Gateway key |
| `JEV_ASK_THRESHOLD` | `0.8` | lower = answers more, wrong more |
| `JEV_MODEL` | `typesafe-ai/jev` | |
| `JEV_GATEWAY_URL` | Vercel's evaluation endpoint | |

The legacy `~/.claude/jev-ask.key` (pre-rename) is still read as a fallback.

## Asking Jev yourself

Skill `skills/ask-jev` + CLI `bin/jev.mjs` let Claude consult Jev for any
judgement call, not just `AskUserQuestion` — classify, pick, yes/no, rate.
The skill defines what a good request looks like: evidence pasted in
`state`, one judgement per question, criteria that are observable and
mutually exclusive. The CLI just sends it:

```
echo '{"state": ..., "questions": ...}' | node "${CLAUDE_PLUGIN_ROOT}/bin/jev.mjs"
```

Full request shape and examples: `skills/ask-jev/SKILL.md`.

## Hacking on it

On the machine where you develop it, point the marketplace at your working copy
instead of GitHub, so edits apply immediately with no push-then-update cycle:

```
/plugin marketplace add ~/workspace/ask-jev
```

## Technical notes

No npm dependencies — just Node's `fetch` and `fs`. It calls the gateway's
evaluation endpoint directly, so there is no `npm install`, no `node_modules`:
clone and it runs.

Claude Code gives hooks no way to return a synthetic tool result. But a
`PreToolUse` hook returning `permissionDecision: "deny"` has its
`permissionDecisionReason` **fed back to the model** — so "answering on your
behalf" is really *blocking the question and telling the model the answer*. In
session you see one `Jev answered: ...` line and the model carries on.

Context comes from the last 12 turns of the session transcript (subagent and
machine-generated turns dropped), trimmed to 6000 characters. Roughly $0.00002
and ~0.7s per question.
