<p align="center"><img src="./assets/logo.jpg" alt="ask-jev logo" width="200"></p>

<h1 align="center">ask-jev</h1>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-2dd4bf?style=flat-square">
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-1abc9c?style=flat-square">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-none-2dd4bf?style=flat-square">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-1abc9c?style=flat-square">
</p>

<p align="center"><strong>English</strong> · <a href="./README.vi.md">Tiếng Việt</a></p>

**Ask [Jev](https://typesafe.ai) before asking you.**

Claude Code often stops to ask you a question (`AskUserQuestion`) even when
the answer is already sitting right there in the conversation. ask-jev
intercepts that question, hands it to Jev — a small, fast model that judges
instead of chats, returning a probability instead of prose — and answers it
for you when the answer is clearly derivable.

Questions that are genuinely yours to answer still reach you, unchanged.

```
"Which date library should we use?"        → picks date-fns (1.00)   — already in package.json
"Package this as a plugin or a skill?"     → picks Plugin   (0.95)
"Which colour palette do you want?"        → asks you                — taste
"Delete the three stale environments?"     → asks you                — irreversible
```

## Install

1. Add the marketplace and install the plugin:

   ```
   /plugin marketplace add yanmad27/ask-jev
   /plugin install ask-jev@ask-jev
   ```

2. Give it a Vercel AI Gateway key (Jev lives in Vercel's model catalogue):

   ```bash
   echo 'vck_...' > ~/.claude/ask-jev.key && chmod 600 ~/.claude/ask-jev.key
   ```

   Already have a gateway key lying around? Set the `AI_GATEWAY_API_KEY`
   environment variable instead — no file needed.

That's it. **No key set →** the plugin quietly does nothing and Claude Code
asks you exactly as it always has. Nothing to break.

## How it works

Before Claude Code shows you a question, ask-jev sends it to Jev with two
things to judge:

1. **Is this even your call to make?** Taste, private priorities, or
   anything irreversible (delete, send, publish, spend money) — Jev refuses
   to touch these, no matter how obvious the "right" answer looks.
2. **If it's not, which option is correct** — given everything said so far in
   the conversation?

Only when Jev is both confident *and* sure the question isn't personal does
Claude get the answer silently and move on. Otherwise the question reaches
you exactly as if ask-jev weren't installed.

### Options need real definitions

For Jev to judge anything, each option needs a description that actually
**defines** it — not just a label. Take "Is this a hamburger?" with an option
simply labelled "Yes": there's nothing to check that against. "Yes" needs a
description like *"A hot sandwich: a cooked ground-meat patty inside a sliced
bun"* — something you could hold the evidence up against and verify.

If any option in a question is missing a description, ask-jev never calls
Jev at all — it bounces the question straight back to Claude with
instructions to re-ask with real definitions added. Nothing reaches you in
that round; Claude just tries again.

## When you still get asked

| Condition | Why |
|---|---|
| the question is personal (`personal > 0.5`) | that's your call, not the model's |
| Jev isn't confident enough (`< JEV_ASK_THRESHOLD`) | guessing is worse than asking |
| the question allows multiple answers (`multiSelect`) | one wrong pick would drag the whole set down with it |
| several questions asked together, only some confident | a half-answer still forces a re-ask, and you'd already have lost a choice to a wrong guess |
| an option has no description | a bare label isn't something Jev can judge — bounced back to Claude, not forwarded to Jev |
| no key set, Jev errors, or it takes over 8s | a broken helper must never be the reason you can't answer |

## Configuration

All optional — sensible defaults out of the box.

| Variable | Default | |
|---|---|---|
| `AI_GATEWAY_API_KEY` | reads `~/.claude/ask-jev.key` | your Vercel AI Gateway key |
| `JEV_ASK_THRESHOLD` | `0.8` | lower it to let Jev answer more often (and be wrong more often) |
| `JEV_MODEL` | `typesafe-ai/jev` | which model Jev evaluation runs against |
| `JEV_GATEWAY_URL` | Vercel's evaluation endpoint | only needed for a custom gateway |

The legacy key path `~/.claude/jev-ask.key` (from before the plugin was
renamed) is still read as a fallback, so nothing breaks if you set it up
under the old name.

## Using Jev directly

Beyond auto-answering `AskUserQuestion`, Claude can consult Jev for *any*
judgement call — classify something, pick between options, answer yes/no,
rate on a scale — via the bundled skill and CLI:

```
echo '{"state": ..., "questions": ...}' | node "${CLAUDE_PLUGIN_ROOT}/bin/jev.mjs"
```

The skill (`skills/ask-jev/SKILL.md`) explains what a good request looks
like — evidence pasted verbatim into `state`, one judgement per question,
criteria that are observable and mutually exclusive — with worked examples.

## Contributing

Developing the plugin locally? Point the marketplace at your working copy
instead of GitHub, so edits apply immediately with no push-then-update cycle:

```
/plugin marketplace add ~/workspace/ask-jev
```

## Implementation notes

<details>
<summary>How the hook actually intercepts a question, and why there's a second hook you never call directly</summary>

<br>

**No npm dependencies.** Just Node's `fetch` and `fs`, calling the gateway's
evaluation endpoint directly. Clone it and it runs — no `npm install`, no
`node_modules`.

**Answering "on your behalf" is really a denial.** Claude Code gives hooks no
way to return a synthetic tool result. But a `PreToolUse` hook that returns
`permissionDecision: "deny"` has its `permissionDecisionReason` fed straight
back to the model — so ask-jev's "answer" is really *blocking the question
and telling Claude what the answer is*. You'll see one `Jev answered: ...`
line in the session, and Claude carries on as if you'd typed it.

**Why there's a `SessionStart` hook too.** Claude Code currently doesn't run
a plugin's own `PreToolUse` hooks at all
([anthropics/claude-code#36397](https://github.com/anthropics/claude-code/issues/36397))
— only `SessionStart` reliably fires from a plugin. So `hooks/self-register.mjs`
runs on every `SessionStart` and writes the `PreToolUse` entry directly into
your `~/.claude/settings.json`, where hooks are known to work — and keeps the
path current across plugin updates. It only ever touches its own entry and
leaves the rest of your `settings.json` alone. Once upstream fixes that bug,
this becomes a harmless duplicate — worst case, one extra gateway call.

**Under the hood**, each option is sent to Jev as `{what, not_for}` —
`not_for` names the sibling options it must not overlap with, so the
definitions rule each other out instead of just sitting side by side.

**Context** comes from the last 12 turns of the session transcript (subagent
and machine-generated turns dropped), trimmed to 6000 characters. Each
question costs roughly $0.00002 and takes about 0.7s.

</details>
