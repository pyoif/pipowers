# Pipowers v0.5.0 — Manual Smoke Test

Run these checks locally before opening a PR. Each is a one-shot command or a
5-minute manual exercise.

## Setup

```bash
cd ~/some/test/repo
mkdir -p .pi
```

## 1. Fresh install (no config files)

```bash
rm -f .pi/pipowers.toml ~/.pi/agent/pipowers.toml
rm -f .pi/superpowers-state.json ~/.pi/agent/superpowers-state.json
```

Start a pi session. Expected:
- No widget visible.
- Agent can write source code, tests, config without prompts.

## 2. Enable strict mode

In the session, run `/pipwr_config`. Pick "Strict" and "Project".
Expected:
- File `.pi/pipowers.toml` is created with `enforcement = "strict"`.
- Widget appears: `[Mode: STRICT]  /pipwr_config (project)`.
- The next source write (e.g. attempt to write `src/foo.ts` before `plan_tracker.init`) triggers a UI confirm-prompt.

## 3. Hand-edit the config

Edit `.pi/pipowers.toml` and change `enforcement = "advisory"`. Save.
Expected:
- Within ~1 second, the widget updates to show `[Mode: ADVISORY]` (or hides).
- Agent can write source code without prompts.

## 4. TDD new-feature hard block

In a new session with strict mode:
- Have the agent write a new test file (e.g. `tests/foo.test.ts`) and run it (fails).
- Have the agent write `src/foo.ts` (the matching source).
- Switch to a clean file: ask the agent to write `src/bar.ts` *without* a failing test for it.
- Expected: UI confirm-prompt fires for `src/bar.ts` write, with "Run the test first" as the default option.

## 5. Plan tracker precondition

In a new session with strict mode, do NOT call `plan_tracker.init`.
- Ask the agent to write `src/baz.ts`.
- Expected: UI confirm-prompt fires with "Initialize plan (recommended)" as the default.
- Pick "Initialize plan" → agent proceeds with the plan_tracker.init call, then the original write.

## 6. Legacy state file fallback

```bash
echo '{"version": 1, "workflow": {"phases": {"brainstorm": "complete", "plan": "complete", "execute": "active", "verify": "pending", "review": "pending", "finish": "pending"}, "currentPhase": "execute", "artifacts": {}, "prompted": {}}}' > .pi/superpowers-state.json
```

Start a session. Expected:
- State loads from `.pi/superpowers-state.json`.
- A log line: `Loaded state from legacy .pi/superpowers-state.json. New writes will go to .pi/pipowers-state.json.`
- After any state change, `.pi/pipowers-state.json` is created.

## 7. Non-interactive fallback

Run pi in non-interactive mode (`pi --no-ui` or `pi --headless` or pipe input).
- In strict mode, attempt a source write during brainstorm.
- Expected: warning injected into tool output, no hard block (advisory fallback).

## 8. Upgrade from `pi-superpowers-plus`

If a user has `pi-superpowers-plus` in their `~/.pi/agent/config.json`:
```json
{ "pi-superpowers-plus": { "enforcement": "advisory" } }
```

Start a session. Expected:
- One-time warning in logs: `Detected legacy pi-superpowers-plus config key in <path>.`
