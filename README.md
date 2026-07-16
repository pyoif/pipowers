# pipowers

![pipowers banner](banner.jpg)

Workflow enforcement and skill management for [pi](https://github.com/badlogic/pi-mono).

Your coding agent doesn't just know the rules — it follows them. Extensions enforce workflow phases in real time. Skills are auto-downloaded from [obra/superpowers](https://github.com/obra/superpowers) and kept up to date once per day.

## What You Get

**12 workflow skills** — brainstorming, writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, test-driven-development, systematic-debugging, verification-before-completion, requesting-code-review, receiving-code-review, finishing-a-development-branch, using-git-worktrees. Auto-downloaded from `obra/superpowers` on startup, refreshed once per day.

**2 extensions** that run in the background:

- **Workflow Monitor** — writes to `docs/plans/` gated by phase, TDD monitor (RED→GREEN→REFACTOR), debug cycle tracking (investigation enforcement), verification gating (commit/push requires passing tests), branch safety notices, warning escalation, `/workflow-next` and `/workflow-reset` commands.
- **Plan Tracker** — `plan_tracker` tool with TUI widget. Tracks tasks (pending/in_progress/complete), required in strict mode.

## Enforcement Modes

| Mode | Process violations | TDD new-feature writes | Plan tracker required | Override |
| --- | --- | --- | --- | --- |
| `advisory` (default) | warn | warn | no | n/a |
| `strict` | hard block 1st strike | hard block 1st strike | yes | allowed |
| `custom` | configurable | configurable | configurable | configurable |

Run `/pipwr_config` to change mode or tunables. Config is TOML, lives in `~/.pi/agent/pipowers.toml` (global) and `.pi/pipowers.toml` (project). Project wins on conflict. Status widget shows current mode in the footer.

## Install

```bash
pi install npm:pipowers
```

Or from git:

```bash
pi install git:github.com/pyoif/pipowers
```

Or add to `.pi/settings.json` (project) or `~/.pi/agent/config.json` (global):

```json
{
  "packages": ["npm:pipowers"]
}
```

Skills are downloaded automatically on first session start. No manual setup needed.

## Credits

pipowers evolved from [pi-superpowers-plus](https://github.com/coctostan/pi-superpowers-plus), rebranded as a standalone package. Skills originate from [obra/superpowers](https://github.com/obra/superpowers). Thanks to the original authors for the workflow design.
