/**
 * Pipowers UI: TUI status widget and /pipwr_config slash command.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { ADVISORY_DEFAULTS, type ConfigLayer, loadConfig, type PipowersConfig, saveConfig } from "./pipowers-config.js";

interface TaskLike {
  name: string;
  status: "pending" | "in_progress" | "complete";
}

export function formatStatusWidget(
  config: PipowersConfig,
  tasks: TaskLike[],
  effectiveSource: "global" | "project" | "default",
): string {
  if (config.enforcement === "advisory" && tasks.length === 0) return "";
  const modeStr = config.enforcement.toUpperCase();
  const planStr =
    tasks.length > 0
      ? ` [Plan: ${tasks.map((t) => (t.status === "complete" ? "✓" : t.status === "in_progress" ? "→" : "○")).join("")}]`
      : "";
  const sourceHint = effectiveSource === "project" ? " (project)" : effectiveSource === "global" ? " (global)" : "";
  return `[Mode: ${modeStr}]${planStr}  /pipwr_config${sourceHint}`;
}

export function buildStatusWidget(
  getConfig: () => PipowersConfig | null,
  getTasks: () => TaskLike[],
  getEffectiveSource: () => "global" | "project" | "default",
) {
  return (_tui: unknown, theme: Theme) => {
    const config = getConfig();
    if (!config) return new Text("", 0, 0);
    const text = formatStatusWidget(config, getTasks(), getEffectiveSource());
    if (!text) return new Text("", 0, 0);
    const color = config.enforcement === "advisory" ? "dim" : config.enforcement === "strict" ? "warning" : "success";
    return new Text(theme.fg(color as any, text), 0, 0);
  };
}

export async function pickMode(
    ctx: ExtensionContext,
    current: "advisory" | "strict" | "custom",
): Promise<"advisory" | "strict" | "custom"> {
    const labels = ["Advisory", "Strict", "Custom", "Cancel"];
    const picked = await ctx.ui.select(`Choose enforcement mode (current: ${current})`, labels);
    switch (picked) {
        case "Advisory": return "advisory";
        case "Strict": return "strict";
        case "Custom": return "custom";
        default: return current;
    }
}

async function pickLayer(ctx: ExtensionContext, defaultLayer: ConfigLayer): Promise<ConfigLayer> {
    const picked = await ctx.ui.select(
        "Save to which layer?",
        ["Project (.pi/pipowers.toml)", "Global (~/.pi/agent/pipowers.toml)"],
    );
    return picked.startsWith("Project") ? "project" : "global";
}

// Placeholder for Task 10. Returns the current tunables so the file compiles
// and the tests pass; Task 10 will replace this with a real editor.
async function pickTunables(_ctx: ExtensionContext, current: PipowersConfig | null): Promise<PipowersConfig["tunables"]> {
    return current?.tunables ?? ADVISORY_DEFAULTS.tunables;
}

export function registerConfigCommand(
    pi: ExtensionAPI,
    getConfig: () => PipowersConfig | null,
    refreshConfig: () => Promise<void>,
): void {
    pi.registerCommand("pipwr_config", async (args, ctx) => {
        const current = getConfig()?.enforcement ?? "advisory";
        const layer: ConfigLayer = await pickLayer(ctx, "project");
        const newMode = await pickMode(ctx, current);
        if (newMode === current && layer === "project") {
            ctx.ui.notify?.("No change.");
            return;
        }
        if (newMode === "custom") {
            const tunables = await pickTunables(ctx, getConfig());
            await saveConfig(layer, { enforcement: "custom", tunables });
        } else {
            await saveConfig(layer, { enforcement: newMode });
        }
        await refreshConfig();
        ctx.ui.notify?.(`Config saved (${layer}).`);
    });
}
