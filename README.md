# pipowers

![pipowers banner](banner.jpg)

Workflow skills and runtime enforcement for [pi](https://github.com/badlogic/pi-mono).

Your coding agent doesn't just know the rules - it follows them. Skills teach the agent *what* to do (brainstorm before building, write tests before code, verify before claiming done). Extensions enforce it in real time.

## What You Get

**12 workflow skills** that guide the agent through structured development.

**3 extensions** that run silently in the background:
- **Workflow Monitor** — phase-aware write enforcement, TDD warnings, debug cycle tracking, verification gating, branch safety, and on-demand reference content.
- **Subagent** — registers a `subagent` tool for dispatching implementation and review work to isolated subprocess agents.
- **Plan Tracker** — tracks task progress with a TUI widget.

## Enforcement Modes

pipowers ships with three modes. The default is **advisory** (warnings only, no blocking) so existing users see no behavior change.

| Mode | Process violations | TDD new-feature writes | Plan tracker required | Override |
| --- | --- | --- | --- | --- |
| `advisory` (default) | warn | warn | no | n/a |
| `strict` | hard block 1st strike | hard block 1st strike | yes | allowed |
| `custom` | configurable | configurable | configurable | configurable |

Run `/pipwr_config` to change mode or tunables. Config is TOML, lives in `~/.pi/agent/pipowers.toml` (global) and `.pi/pipowers.toml` (project). Project wins on conflict.

## Install

```bash
pi install npm:pipowers
```

Or from git:

```bash
pi install git:github.com/coctostan/pipowers
```

Or add to `.pi/settings.json` (project) or `~/.pi/agent/config.json` (global):

```json
{
  "packages": ["npm:pipowers"]
}
```

## Credits

pipowers evolved from [pi-superpowers-plus](https://github.com/coctostan/pi-superpowers-plus), which itself was an active-enforcement extension of [pi-superpowers](https://github.com/coctostan/pi-superpowers). It is now a standalone package. Thanks to the original authors for the workflow design.
